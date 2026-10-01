import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findRenewDuplicates,
  mergeExtractedDuplicates,
  parseRenewPayload,
  prefillVerifiedFrom,
  RENEW_UI_STEPS,
  type RenewMedication,
} from './renew';
import {
  evaluateTherapyReviewGate,
  resolveIndicationMapping,
  therapyIndicationsReady,
  applyStableToReviews,
  applyStableResponses,
  groupTherapyConditions,
  getAffectedMedicationSelectorMode,
  isDuplicateAdherenceConcern,
  formatAffectedMedicationsLabel,
  formatAdherenceConcernsNarrative,
  formatEffectivenessNarrative,
  formatMedicationConcernsNarrative,
  isConditionReviewComplete,
  getConditionReviewCompletion,
  isDuplicateMedicationConcern,
  therapyReviewFieldErrors,
  formatConditionCategory,
  therapyReviewProgressCopy,
  effectivenessConcernAnswer,
  effectivenessStatusFromConcernAnswer,
  undoBulkStablePatch,
} from './renew-therapy';
import {
  effectivenessConcernReasonOptions,
  effectivenessStatusForConcernReason,
  getEffectivenessReviewCopy,
  isUnableToAssessStatus,
} from './renew-effectiveness';

function med(patch: Partial<RenewMedication> & { id: string }): RenewMedication {
  return {
    id: patch.id,
    source: patch.source ?? { type: 'manual_search' },
    raw: patch.raw ?? {},
    normalized: {
      brandName: null,
      genericName: null,
      strength: null,
      dosageForm: null,
      ...patch.normalized,
    },
    confidence: patch.confidence ?? {},
    reviewStatus: patch.reviewStatus ?? 'not_reviewed',
    ccddMatchStatus: patch.ccddMatchStatus ?? 'unmatched',
    pharmacistEdited: patch.pharmacistEdited ?? false,
  };
}

describe('findRenewDuplicates', () => {
  it('flags identical DINs', () => {
    const pairs = findRenewDuplicates([
      med({
        id: 'a',
        normalized: { din: '02231055', brandName: 'Crestor', strength: '20 mg' },
      }),
      med({
        id: 'b',
        normalized: { din: '02231055', genericName: 'Rosuvastatin', strength: '20 mg' },
      }),
    ]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]?.reason, 'same_din');
  });

  it('flags brand vs generic at the same strength and form', () => {
    const pairs = findRenewDuplicates([
      med({
        id: 'a',
        normalized: { brandName: 'Crestor', genericName: 'Rosuvastatin', strength: '20 mg', dosageForm: 'tablet' },
      }),
      med({
        id: 'b',
        normalized: { genericName: 'rosuvastatin', strength: '20 mg', dosageForm: 'tablet' },
      }),
    ]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]?.reason, 'same_generic_strength_form');
  });

  it('does not flag different strengths', () => {
    const pairs = findRenewDuplicates([
      med({
        id: 'a',
        normalized: { genericName: 'Amlodipine', strength: '5 mg', dosageForm: 'tablet' },
      }),
      med({
        id: 'b',
        normalized: { genericName: 'Amlodipine', strength: '10 mg', dosageForm: 'tablet' },
      }),
    ]);
    assert.equal(pairs.length, 0);
  });
});

describe('mergeExtractedDuplicates', () => {
  it('keeps one row and fills missing prescriber and quantity from the other screenshot', () => {
    const merged = mergeExtractedDuplicates([
      med({
        id: 'a',
        normalized: {
          genericName: 'Rosuvastatin',
          strength: '20 mg',
          dosageForm: 'tablet',
          quantity: 30,
        },
        confidence: { quantity: 0.95, prescriber: null },
      }),
      med({
        id: 'b',
        normalized: {
          brandName: 'Crestor',
          genericName: 'rosuvastatin',
          strength: '20 mg',
          dosageForm: 'tablet',
          prescriberName: 'Dr. A. Smith',
        },
        raw: { prescriberText: 'Dr. A. Smith' },
        confidence: { prescriber: 0.92, quantity: null },
      }),
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, 'a');
    assert.equal(merged[0]?.normalized.quantity, 30);
    assert.equal(merged[0]?.normalized.prescriberName, 'Dr. A. Smith');
    assert.equal(merged[0]?.normalized.brandName, 'Crestor');
  });

  it('leaves different strengths as separate medications', () => {
    const merged = mergeExtractedDuplicates([
      med({
        id: 'a',
        normalized: { genericName: 'Amlodipine', strength: '5 mg', dosageForm: 'tablet' },
      }),
      med({
        id: 'b',
        normalized: { genericName: 'Amlodipine', strength: '10 mg', dosageForm: 'tablet' },
      }),
    ]);
    assert.equal(merged.length, 2);
  });
});

describe('parseRenewPayload', () => {
  it('returns an empty payload for invalid input', () => {
    const parsed = parseRenewPayload(null);
    assert.equal(parsed.medicationList.items.length, 0);
    assert.equal(parsed.medicationList.confirmed, false);
    assert.equal(parsed.therapyReview.mappings.length, 0);
  });

  it('keeps valid medications and drops nameless rows without ids', () => {
    const parsed = parseRenewPayload({
      medicationList: {
        confirmed: true,
        items: [
          { id: 'm1', normalized: { genericName: 'Metformin', strength: '500 mg' } },
          { normalized: { genericName: 'Ghost' } },
        ],
      },
    });
    assert.equal(parsed.medicationList.items.length, 1);
    assert.equal(parsed.medicationList.confirmed, true);
  });

    it('preserves therapy review mappings and adherence otherText', () => {
    const parsed = parseRenewPayload({
      therapyReview: {
        mappings: [
          {
            medicationId: 'm1',
            conditionId: 'c1',
            mappingSource: 'curated_auto',
            status: 'provisional',
            pharmacistConfirmed: false,
            candidates: [],
          },
        ],
        reviews: [
          {
            id: 'r1',
            conditionId: 'c1',
            adherenceStatus: 'no',
            effectivenessStatus: 'yes',
            medicationConcernStatus: 'no',
            issues: [
              {
                id: 'i1',
                conditionKey: 'cond:c1',
                medicationIds: ['m1'],
                issueType: 'adherence',
                issueCategory: 'other',
                otherText: 'Uses a weekly pillbox inconsistently',
                details: null,
                requiresStep3Review: true,
              },
            ],
          },
        ],
      },
    });
    assert.equal(parsed.therapyReview.mappings[0]?.conditionId, 'c1');
    assert.equal(parsed.therapyReview.reviews[0]?.issues[0]?.otherText, 'Uses a weekly pillbox inconsistently');
  });

  it('normalizes legacy unsure effectiveness to unable_to_assess', () => {
    const parsed = parseRenewPayload({
      therapyReview: {
        reviews: [
          {
            id: 'r1',
            conditionId: 'c1',
            effectivenessStatus: 'unsure',
            issues: [
              {
                id: 'i1',
                conditionKey: 'cond:c1',
                medicationIds: [],
                issueType: 'effectiveness',
                issueCategory: 'no_recent_monitoring',
                requiresStep3Review: true,
              },
            ],
          },
        ],
      },
    });
    assert.equal(parsed.therapyReview.reviews[0]?.effectivenessStatus, 'unable_to_assess');
  });
});

describe('resolveIndicationMapping', () => {
  it('auto-groups a single primary indication', () => {
    const resolved = resolveIndicationMapping([
      {
        conditionId: 'htn',
        conditionCode: 'HYPERTENSION',
        displayName: 'Hypertension',
        mappingStrength: 'primary',
        autoGroupAllowed: true,
        alwaysRequireConfirmation: false,
        rankingWeight: 100,
      },
    ]);
    assert.equal(resolved.status, 'provisional');
    assert.equal(resolved.conditionId, 'htn');
  });

  it('requires confirmation when alwaysRequireConfirmation is set', () => {
    const resolved = resolveIndicationMapping([
      {
        conditionId: 'pain',
        conditionCode: 'NEUROPATHIC_PAIN',
        displayName: 'Neuropathic pain',
        mappingStrength: 'common',
        autoGroupAllowed: false,
        alwaysRequireConfirmation: true,
        rankingWeight: 70,
      },
      {
        conditionId: 'seizure',
        conditionCode: 'SEIZURE',
        displayName: 'Seizure disorder',
        mappingStrength: 'possible',
        autoGroupAllowed: false,
        alwaysRequireConfirmation: true,
        rankingWeight: 40,
      },
    ]);
    assert.equal(resolved.status, 'needs_confirmation');
    assert.equal(resolved.conditionId, null);
    assert.equal(resolved.candidates.length, 2);
  });
});

describe('evaluateTherapyReviewGate', () => {
  it('blocks continue until every medication is linked and reviewed', () => {
    const items = [
      med({ id: 'm1', normalized: { genericName: 'Amlodipine' } }),
      med({ id: 'm2', normalized: { genericName: 'Gabapentin' } }),
    ];
    const catalog = [
      {
        id: 'htn',
        code: 'HYPERTENSION',
        displayName: 'Hypertension',
        category: 'cardiovascular',
        description: null,
        defaultEffectivenessQuestion: 'BP generally controlled / stable?',
        commonForRenewal: true,
        displayPriority: 10,
      },
    ];
    const incomplete = evaluateTherapyReviewGate(
      items,
      {
        mappings: [
          {
            medicationId: 'm1',
            conditionId: 'htn',
            customIndicationText: null,
            mappingSource: 'curated_auto',
            status: 'provisional',
            pharmacistConfirmed: false,
            candidates: [],
          },
          {
            medicationId: 'm2',
            conditionId: null,
            customIndicationText: null,
            mappingSource: 'ai_ranked',
            status: 'needs_confirmation',
            pharmacistConfirmed: false,
            candidates: [],
          },
        ],
        reviews: [
          {
            id: 'r1',
            conditionId: 'htn',
            customConditionText: null,
            adherenceStatus: 'yes',
            effectivenessStatus: 'yes',
            medicationConcernStatus: 'no',
            answerSource: 'individual',
            issues: [],
            manuallyPreserved: false,
          },
        ],
        suggestedConditionIds: [],
        completed: false,
        completedAt: null,
        mappingFingerprint: 'm1,m2',
      },
      catalog,
    );
    assert.equal(incomplete.ok, false);
    assert.deepEqual(incomplete.unresolvedMedicationIds, ['m2']);
  });

  it('counts a pharmacist-added condition with no medications and still allows continue', () => {
    const items = [med({ id: 'm1', normalized: { genericName: 'Amlodipine' } })];
    const catalog = [
      {
        id: 'htn',
        code: 'HYPERTENSION',
        displayName: 'Hypertension',
        category: 'cardiovascular',
        description: null,
        defaultEffectivenessQuestion: 'BP generally controlled / stable?',
        commonForRenewal: true,
        displayPriority: 10,
      },
      {
        id: 'gerd',
        code: 'GERD',
        displayName: 'GERD',
        category: 'gastrointestinal',
        description: null,
        defaultEffectivenessQuestion: 'Symptoms adequately controlled?',
        commonForRenewal: true,
        displayPriority: 20,
      },
    ];
    const therapy = {
      mappings: [
        {
          medicationId: 'm1',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected' as const,
          status: 'pharmacist_confirmed' as const,
          pharmacistConfirmed: true,
          candidates: [],
        },
      ],
      reviews: [
        {
          id: 'r1',
          conditionId: 'htn',
          customConditionText: null,
          adherenceStatus: 'yes' as const,
          effectivenessStatus: 'yes' as const,
          medicationConcernStatus: 'no' as const,
          answerSource: 'individual' as const,
          issues: [],
          manuallyPreserved: false,
        },
        {
          id: 'r2',
          conditionId: 'gerd',
          customConditionText: null,
          adherenceStatus: null,
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: null,
          issues: [],
          manuallyPreserved: true,
        },
      ],
      suggestedConditionIds: [],
      completed: false,
      completedAt: null,
      mappingFingerprint: 'm1',
    };
    const groups = groupTherapyConditions(items, therapy, catalog);
    assert.equal(groups.some((row) => row.conditionId === 'gerd'), true);
    assert.equal(groups.find((row) => row.conditionId === 'gerd')?.medicationIds.length, 0);
    assert.equal(groups.find((row) => row.conditionId === 'htn')?.category, 'cardiovascular');
    const gate = evaluateTherapyReviewGate(items, therapy, catalog);
    assert.equal(gate.conditionsConfirmed, 2);
    assert.equal(gate.ok, true);
    assert.deepEqual(gate.incompleteReviewKeys, []);
  });

  it('counts documented adherence concerns and partial review progress', () => {
    const items = [
      med({ id: 'm1', normalized: { genericName: 'Amlodipine' } }),
      med({ id: 'm2', normalized: { genericName: 'Perindopril' } }),
      med({ id: 'm3', normalized: { genericName: 'Pravastatin' } }),
      med({ id: 'm4', normalized: { genericName: 'Ezetimibe' } }),
    ];
    const catalog = [
      {
        id: 'htn',
        code: 'HYPERTENSION',
        displayName: 'Hypertension',
        category: 'cardiovascular',
        description: null,
        defaultEffectivenessQuestion: 'BP generally controlled / stable?',
        commonForRenewal: true,
        displayPriority: 10,
      },
      {
        id: 'lipid',
        code: 'DYSLIPIDEMIA',
        displayName: 'Dyslipidemia / CV prevention',
        category: 'cardiovascular',
        description: null,
        defaultEffectivenessQuestion: 'Therapy effective / condition stable?',
        commonForRenewal: true,
        displayPriority: 20,
      },
    ];
    const mapping = (
      medicationId: string,
      conditionId: string,
    ) => ({
      medicationId,
      conditionId,
      customIndicationText: null,
      mappingSource: 'pharmacist_selected' as const,
      status: 'pharmacist_confirmed' as const,
      pharmacistConfirmed: true,
      candidates: [],
    });
    const gate = evaluateTherapyReviewGate(
      items,
      {
        mappings: [
          mapping('m1', 'htn'),
          mapping('m2', 'htn'),
          mapping('m3', 'lipid'),
          mapping('m4', 'lipid'),
        ],
        reviews: [
          {
            id: 'r1',
            conditionId: 'htn',
            customConditionText: null,
            adherenceStatus: 'no',
            effectivenessStatus: 'yes',
            medicationConcernStatus: 'no',
            answerSource: 'individual',
            issues: [
              {
                id: 'i1',
                conditionKey: 'cond:htn',
                medicationIds: ['m1', 'm2'],
                issueType: 'adherence',
                issueCategory: 'missed_occasionally',
                actionTaken: null,
                details: 'Misses evening doses',
                otherText: null,
                requiresStep3Review: true,
              },
            ],
            manuallyPreserved: false,
          },
          {
            id: 'r2',
            conditionId: 'lipid',
            customConditionText: null,
            adherenceStatus: null,
            effectivenessStatus: 'yes',
            medicationConcernStatus: 'no',
            answerSource: 'individual',
            issues: [],
            manuallyPreserved: false,
          },
        ],
        suggestedConditionIds: [],
        completed: false,
        completedAt: null,
        mappingFingerprint: 'm1,m2,m3,m4',
      },
      catalog,
    );
    assert.equal(gate.ok, false);
    assert.equal(gate.reviewableCount, 2);
    assert.equal(gate.adherenceReviewedCount, 1);
    assert.equal(gate.effectivenessReviewedCount, 2);
    assert.equal(gate.tolerabilityReviewedCount, 2);
    assert.equal(gate.adherenceConcernCount, 1);
    assert.equal(gate.therapyStatus, 'in_progress');
  });
});

describe('applyStableToReviews', () => {
  it('does not mark an unlinked pharmacist-added condition as stable', () => {
    const reviews = applyStableToReviews(
      [
        {
          id: 'r1',
          conditionId: 'htn',
          customConditionText: null,
          adherenceStatus: null,
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: null,
          issues: [],
          manuallyPreserved: false,
        },
        {
          id: 'r2',
          conditionId: 'gerd',
          customConditionText: null,
          adherenceStatus: null,
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: null,
          issues: [],
          manuallyPreserved: true,
        },
      ],
      [
        {
          medicationId: 'm1',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
      ],
    );
    assert.equal(reviews[0]?.adherenceStatus, 'yes');
    assert.equal(reviews[1]?.adherenceStatus, null);
    assert.equal(reviews[1]?.manuallyPreserved, true);
  });

  it('does not overwrite a review that already has an adherence concern', () => {
    const reviews = applyStableToReviews(
      [
        {
          id: 'r1',
          conditionId: 'htn',
          customConditionText: null,
          adherenceStatus: 'no',
          effectivenessStatus: 'yes',
          medicationConcernStatus: 'no',
          answerSource: 'individual',
          issues: [
            {
              id: 'i1',
              conditionKey: 'cond:htn',
              medicationIds: ['m1', 'm2'],
              issueType: 'adherence',
              issueCategory: 'missed_occasionally',
              actionTaken: null,
              details: 'Misses evening doses',
              otherText: null,
              requiresStep3Review: true,
            },
          ],
          manuallyPreserved: false,
        },
        {
          id: 'r2',
          conditionId: 'lipid',
          customConditionText: null,
          adherenceStatus: null,
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: null,
          issues: [],
          manuallyPreserved: false,
        },
      ],
      [
        {
          medicationId: 'm1',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
        {
          medicationId: 'm2',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
        {
          medicationId: 'm3',
          conditionId: 'lipid',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
      ],
    );
    assert.equal(reviews[0]?.adherenceStatus, 'no');
    assert.equal(reviews[0]?.issues[0]?.issueCategory, 'missed_occasionally');
    assert.equal(reviews[1]?.adherenceStatus, 'yes');
    assert.equal(reviews[1]?.medicationConcernStatus, 'no');
  });

  it('does not overwrite a saved unable-to-assess response', () => {
    const reviews = applyStableToReviews(
      [
        {
          id: 'r1',
          conditionId: 'htn',
          customConditionText: null,
          adherenceStatus: 'yes',
          effectivenessStatus: 'unable_to_assess',
          medicationConcernStatus: 'no',
          answerSource: 'individual',
          issues: [
            {
              id: 'i1',
              conditionKey: 'cond:htn',
              medicationIds: ['m1'],
              issueType: 'effectiveness',
              issueCategory: 'no_recent_monitoring',
              actionTaken: null,
              details: null,
              otherText: null,
              requiresStep3Review: true,
            },
          ],
          manuallyPreserved: false,
        },
      ],
      [
        {
          medicationId: 'm1',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
      ],
    );
    assert.equal(reviews[0]?.effectivenessStatus, 'unable_to_assess');
    assert.equal(reviews[0]?.issues[0]?.issueCategory, 'no_recent_monitoring');
  });

  it('fills only unanswered fields on a documented exception row', () => {
    const reviews = applyStableToReviews(
      [
        {
          id: 'r1',
          conditionId: 'htn',
          customConditionText: null,
          adherenceStatus: 'no',
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: 'individual',
          issues: [
            {
              id: 'i1',
              conditionKey: 'cond:htn',
              medicationIds: ['m1'],
              issueType: 'adherence',
              issueCategory: 'missed_occasionally',
              actionTaken: null,
              details: 'Misses evening doses',
              otherText: null,
              requiresStep3Review: true,
            },
          ],
          manuallyPreserved: false,
        },
      ],
      [
        {
          medicationId: 'm1',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
      ],
    );
    assert.equal(reviews[0]?.adherenceStatus, 'no');
    assert.equal(reviews[0]?.effectivenessStatus, 'yes');
    assert.equal(reviews[0]?.medicationConcernStatus, 'no');
    assert.equal(reviews[0]?.issues[0]?.issueCategory, 'missed_occasionally');
  });

  it('fills remaining stable answers on a partially answered row', () => {
    const reviews = applyStableToReviews(
      [
        {
          id: 'r1',
          conditionId: 'htn',
          customConditionText: null,
          adherenceStatus: 'yes',
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: 'individual',
          issues: [],
          manuallyPreserved: false,
        },
      ],
      [
        {
          medicationId: 'm1',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
      ],
    );
    assert.equal(reviews[0]?.adherenceStatus, 'yes');
    assert.equal(reviews[0]?.effectivenessStatus, 'yes');
    assert.equal(reviews[0]?.medicationConcernStatus, 'no');
    assert.equal(reviews[0]?.answerSource, 'individual');
  });

  it('skips rows with unsaved editors and reports counts', () => {
    const result = applyStableResponses(
      [
        {
          id: 'r1',
          conditionId: 'htn',
          customConditionText: null,
          adherenceStatus: null,
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: null,
          issues: [],
          manuallyPreserved: false,
        },
        {
          id: 'r2',
          conditionId: 'gerd',
          customConditionText: null,
          adherenceStatus: null,
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: null,
          issues: [],
          manuallyPreserved: false,
        },
      ],
      [
        {
          medicationId: 'm1',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
        {
          medicationId: 'm2',
          conditionId: 'gerd',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [],
        },
      ],
      { skipReviewIds: ['r1'] },
    );
    assert.equal(result.reviews[0]?.adherenceStatus, null);
    assert.equal(result.reviews[1]?.adherenceStatus, 'yes');
    assert.equal(result.updatedCount, 1);
    assert.equal(result.skippedUnsavedCount, 1);
  });
});

describe('getConditionReviewCompletion', () => {
  it('treats documented exceptions as complete', () => {
    const completeException = {
      id: 'r1',
      conditionId: 'htn',
      customConditionText: null,
      adherenceStatus: 'no' as const,
      effectivenessStatus: 'yes' as const,
      medicationConcernStatus: 'no' as const,
      answerSource: 'individual' as const,
      issues: [
        {
          id: 'i1',
          conditionKey: 'cond:htn',
          medicationIds: ['m1'],
          issueType: 'adherence' as const,
          issueCategory: 'missed_occasionally',
          actionTaken: null,
          details: 'Misses evening doses',
          otherText: null,
          requiresStep3Review: true,
        },
      ],
      manuallyPreserved: false,
    };
    assert.equal(getConditionReviewCompletion(completeException, 1), 'COMPLETE_WITH_CONCERN');
    assert.equal(isConditionReviewComplete(completeException, 1), true);
  });

  it('keeps an unsaved medication concern incomplete', () => {
    const incomplete = {
      id: 'r1',
      conditionId: 'htn',
      customConditionText: null,
      adherenceStatus: 'yes' as const,
      effectivenessStatus: 'yes' as const,
      medicationConcernStatus: 'yes' as const,
      answerSource: 'individual' as const,
      issues: [],
      manuallyPreserved: false,
    };
    assert.equal(getConditionReviewCompletion(incomplete, 1), 'INCOMPLETE');
  });

  it('treats a saved medication concern as complete', () => {
    const review = {
      id: 'r1',
      conditionId: 'htn',
      customConditionText: null,
      adherenceStatus: 'yes' as const,
      effectivenessStatus: 'yes' as const,
      medicationConcernStatus: 'yes' as const,
      answerSource: 'individual' as const,
      issues: [
        {
          id: 'i1',
          conditionKey: 'cond:htn',
          medicationIds: ['m1'],
          issueType: 'medication_concern' as const,
          issueCategory: 'side_effect',
          actionTaken: 'continue_and_monitor',
          details: 'Mild ankle edema',
          otherText: null,
          requiresStep3Review: true,
        },
      ],
      manuallyPreserved: false,
    };
    assert.equal(getConditionReviewCompletion(review, 1), 'COMPLETE_WITH_CONCERN');
  });
});

describe('adherence concern helpers', () => {
  it('hides the medication selector for one linked medication', () => {
    assert.equal(getAffectedMedicationSelectorMode(1), 'HIDDEN');
  });

  it('uses A / B / Both chips for exactly two medications', () => {
    assert.equal(getAffectedMedicationSelectorMode(2), 'TWO_MED_CHIPS');
  });

  it('uses checkboxes for three or more medications', () => {
    assert.equal(getAffectedMedicationSelectorMode(3), 'MULTI_CHECKBOX');
  });

  it('detects the same medication set and issue type as a duplicate', () => {
    const existing = [
      {
        id: 'i1',
        conditionKey: 'cond:htn',
        medicationIds: ['m2', 'm1'],
        issueType: 'adherence' as const,
        issueCategory: 'missed_occasionally',
        actionTaken: null,
        details: null,
        otherText: null,
        requiresStep3Review: true,
      },
    ];
    assert.equal(
      isDuplicateAdherenceConcern(
        existing,
        { medicationIds: ['m1', 'm2'], issueCategory: 'missed_occasionally' },
        'new',
      ),
      true,
    );
    assert.equal(
      isDuplicateAdherenceConcern(
        existing,
        { medicationIds: ['m1'], issueCategory: 'missed_occasionally' },
        'new',
      ),
      false,
    );
    assert.equal(
      isDuplicateAdherenceConcern(
        existing,
        { medicationIds: ['m1', 'm2'], issueCategory: 'stopped' },
        'new',
      ),
      false,
    );
    assert.equal(
      isDuplicateAdherenceConcern(
        existing,
        { medicationIds: ['m1', 'm2'], issueCategory: 'missed_occasionally' },
        'i1',
      ),
      false,
    );
  });

  it('labels both medications when the full two-med set is affected', () => {
    const meds = [
      med({ id: 'm1', normalized: { genericName: 'Amlodipine Besylate' } }),
      med({ id: 'm2', normalized: { genericName: 'Perindopril Erbumine' } }),
    ];
    assert.equal(formatAffectedMedicationsLabel(['m1', 'm2'], ['m1', 'm2'], meds), 'both medications');
    assert.equal(formatAffectedMedicationsLabel(['m1'], ['m1', 'm2'], meds), 'Amlodipine Besylate');
  });

  it('detects a duplicate medication concern on the same medications, type, and action', () => {
    const existing = [
      {
        id: 'i1',
        conditionKey: 'cond:htn',
        medicationIds: ['m1'],
        issueType: 'medication_concern' as const,
        issueCategory: 'side_effect',
        actionTaken: 'continue_and_monitor',
        details: null,
        otherText: null,
        requiresStep3Review: true,
      },
    ];
    assert.equal(
      isDuplicateMedicationConcern(
        existing,
        { medicationIds: ['m1'], issueCategory: 'side_effect', actionTaken: 'continue_and_monitor' },
        'new',
      ),
      true,
    );
    assert.equal(
      isDuplicateMedicationConcern(
        existing,
        { medicationIds: ['m1'], issueCategory: 'side_effect', actionTaken: 'refer_to_prescriber' },
        'new',
      ),
      false,
    );
  });

  it('writes a medication-linked concern narrative', () => {
    const meds = [
      med({ id: 'm1', normalized: { genericName: 'Amlodipine' } }),
      med({ id: 'm2', normalized: { genericName: 'Perindopril' } }),
    ];
    const narrative = formatMedicationConcernsNarrative(
      [
        {
          id: 'i1',
          conditionKey: 'cond:htn',
          medicationIds: ['m1', 'm2'],
          issueType: 'medication_concern',
          issueCategory: 'side_effect',
          actionTaken: 'refer_to_prescriber',
          details: 'Patient reports dizziness since regimen intensified',
          otherText: null,
          requiresStep3Review: true,
        },
      ],
      meds,
    );
    assert.match(narrative ?? '', /amlodipine and perindopril/i);
    assert.match(narrative ?? '', /refer to prescriber/i);
  });

  it('writes a medication-specific adherence narrative', () => {
    const meds = [
      med({ id: 'm1', normalized: { genericName: 'Amlodipine' } }),
      med({ id: 'm2', normalized: { genericName: 'Perindopril' } }),
    ];
    const narrative = formatAdherenceConcernsNarrative(
      [
        {
          id: 'i1',
          conditionKey: 'cond:htn',
          medicationIds: ['m1', 'm2'],
          issueType: 'adherence',
          issueCategory: 'missed_occasionally',
          actionTaken: null,
          details: 'Misses evening doses 1-2 times per week.',
          otherText: null,
          requiresStep3Review: true,
        },
      ],
      meds,
    );
    assert.match(narrative ?? '', /both Amlodipine and Perindopril/);
    assert.match(narrative ?? '', /Misses evening doses/);
  });
});

describe('effectiveness review copy', () => {
  it('uses hypertension-specific unable-to-assess wording', () => {
    const copy = getEffectivenessReviewCopy('HYPERTENSION', 'Hypertension');
    assert.equal(copy.unableTitle, 'Unable to assess blood pressure control');
    assert.equal(
      copy.noReasons.some((row) => row.label === 'BP above target / not at goal'),
      true,
    );
    assert.equal(
      copy.unableReasons.some((row) => row.label === 'No recent BP / monitoring result'),
      true,
    );
  });

  it('does not document unable-to-assess as treatment failure', () => {
    const narrative = formatEffectivenessNarrative(
      {
        id: 'r1',
        conditionId: 'htn',
        customConditionText: null,
        adherenceStatus: 'yes',
        effectivenessStatus: 'unable_to_assess',
        medicationConcernStatus: 'no',
        answerSource: 'individual',
        issues: [
          {
            id: 'i1',
            conditionKey: 'cond:htn',
            medicationIds: ['m1'],
            issueType: 'effectiveness',
            issueCategory: 'no_recent_monitoring',
            actionTaken: null,
            details: null,
            otherText: null,
            requiresStep3Review: true,
          },
        ],
        manuallyPreserved: false,
      },
      'Hypertension',
      'HYPERTENSION',
    );
    assert.match(narrative ?? '', /could not be assessed/i);
    assert.equal(/uncontrolled/i.test(narrative ?? ''), false);
    assert.equal(isUnableToAssessStatus('unable_to_assess'), true);
  });
});

describe('therapyReviewFieldErrors', () => {
  const blank = {
    id: 'r1',
    conditionId: 'htn',
    customConditionText: null,
    adherenceStatus: null as const,
    effectivenessStatus: null as const,
    medicationConcernStatus: null as const,
    answerSource: 'individual' as const,
    issues: [],
    manuallyPreserved: false,
  };

  it('requires an answer on every review field', () => {
    const errors = therapyReviewFieldErrors(blank, 1);
    assert.deepEqual(
      errors.map((row) => row.field),
      ['adherence', 'effectiveness', 'medicationConcern'],
    );
    assert.equal(isConditionReviewComplete(blank, 1), false);
    assert.match(errors[0]!.message, /taking this as prescribed/i);
    assert.match(errors[1]!.message, /effective/i);
    assert.match(errors[2]!.message, /medication-related concerns/i);
  });

  it('is complete when Yes / Yes / No are selected', () => {
    const review = {
      ...blank,
      adherenceStatus: 'yes' as const,
      effectivenessStatus: 'yes' as const,
      medicationConcernStatus: 'no' as const,
    };
    assert.deepEqual(therapyReviewFieldErrors(review, 1), []);
    assert.equal(isConditionReviewComplete(review, 1), true);
  });

  it('requires a saved concern when No or Unable to assess is selected', () => {
    const incompleteNo = {
      ...blank,
      adherenceStatus: 'no' as const,
      effectivenessStatus: 'no' as const,
      medicationConcernStatus: 'yes' as const,
    };
    const errors = therapyReviewFieldErrors(incompleteNo, 1);
    assert.equal(errors.length, 3);
    assert.match(errors.find((row) => row.field === 'adherence')!.message, /save/i);
    assert.match(errors.find((row) => row.field === 'effectiveness')!.message, /effectiveness concern/i);
    assert.match(errors.find((row) => row.field === 'medicationConcern')!.message, /medication-related concern/i);
  });
});

describe('therapyIndicationsReady', () => {
  it('is true only when every medication has a resolved indication', () => {
    const items = [
      med({ id: 'm1', normalized: { genericName: 'Amlodipine' } }),
      med({ id: 'm2', normalized: { genericName: 'Gabapentin' } }),
    ];
    const therapy = {
      mappings: [
        {
          medicationId: 'm1',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected' as const,
          status: 'pharmacist_confirmed' as const,
          pharmacistConfirmed: true,
          candidates: [],
        },
      ],
      reviews: [],
      suggestedConditionIds: [],
      completed: false,
      completedAt: null,
      mappingFingerprint: null,
    };
    assert.equal(therapyIndicationsReady(items, therapy), false);
    assert.equal(
      therapyIndicationsReady(items, {
        ...therapy,
        mappings: [
          ...therapy.mappings,
          {
            medicationId: 'm2',
            conditionId: null,
            customIndicationText: 'Neuropathic pain',
            mappingSource: 'custom' as const,
            status: 'custom' as const,
            pharmacistConfirmed: true,
            candidates: [],
          },
        ],
      }),
      true,
    );
  });
});

describe('prefillVerifiedFrom', () => {
  it('maps Kroll and Netcare sources', () => {
    assert.equal(prefillVerifiedFrom('kroll', 'compliance_sheet'), 'pharmacy_dispensing_record');
    assert.equal(prefillVerifiedFrom('netcare', 'screenshot'), 'provincial_medication_record');
  });
});

describe('RENEW_UI_STEPS', () => {
  it('keeps the four-step Renew workflow', () => {
    assert.equal(RENEW_UI_STEPS.length, 4);
    assert.deepEqual(
      RENEW_UI_STEPS.map((s) => s.shortLabel),
      ['Medications', 'Therapy', 'Monitoring', 'Renew'],
    );
    assert.equal(RENEW_UI_STEPS[0]?.helper, 'Add or import medications');
    assert.equal(RENEW_UI_STEPS[0]?.pageTitle, 'Medications to Renew');
    assert.match(
      RENEW_UI_STEPS[1]?.description ?? '',
      /adherence, effectiveness, and medication-related concerns/,
    );
  });
});

describe('therapy review clickable UI helpers', () => {
  it('formats condition categories in sentence case', () => {
    assert.equal(formatConditionCategory('mental_health'), 'Mental health');
    assert.equal(formatConditionCategory('cardiovascular'), 'Cardiovascular');
    assert.equal(formatConditionCategory(null), null);
  });

  it('inverts effectiveness concern answers without changing the stored stable model', () => {
    assert.equal(effectivenessConcernAnswer('yes'), 'no');
    assert.equal(effectivenessConcernAnswer('no'), 'yes');
    assert.equal(effectivenessConcernAnswer('unable_to_assess'), 'yes');
    assert.equal(effectivenessStatusFromConcernAnswer('no'), 'yes');
    assert.equal(effectivenessStatusFromConcernAnswer('yes'), 'no');
  });

  it('reports compact review progress and findings', () => {
    assert.equal(
      therapyReviewProgressCopy({ reviewedCount: 1, totalCount: 3, findingCount: 0 }),
      '1 of 3 reviewed',
    );
    assert.equal(
      therapyReviewProgressCopy({ reviewedCount: 3, totalCount: 3, findingCount: 0 }),
      '3 reviewed · No findings',
    );
    assert.equal(
      therapyReviewProgressCopy({ reviewedCount: 3, totalCount: 3, findingCount: 1 }),
      '3 reviewed · 1 finding',
    );
  });

  it('undoes only unchanged bulk-stable fields', () => {
    const previous = {
      id: 'r1',
      conditionId: 'htn',
      customConditionText: null,
      adherenceStatus: null,
      effectivenessStatus: null,
      medicationConcernStatus: null,
      answerSource: null,
      issues: [],
      manuallyPreserved: false,
    };
    const bulk = {
      ...previous,
      adherenceStatus: 'yes' as const,
      effectivenessStatus: 'yes' as const,
      medicationConcernStatus: 'no' as const,
      answerSource: 'pharmacist_bulk_action' as const,
    };
    assert.deepEqual(undoBulkStablePatch(bulk, previous), {
      adherenceStatus: null,
      effectivenessStatus: null,
      medicationConcernStatus: null,
    });
    assert.equal(
      undoBulkStablePatch(
        { ...bulk, adherenceStatus: 'no', issues: [] },
        previous,
      )?.adherenceStatus,
      undefined,
    );
  });

  it('treats unable to confirm as an effectiveness concern reason', () => {
    const copy = getEffectivenessReviewCopy('HYPERTENSION', 'Hypertension');
    const reasons = effectivenessConcernReasonOptions(copy);
    assert.equal(
      reasons.some((row) => row.id === 'unable_to_confirm'),
      true,
    );
    assert.equal(effectivenessStatusForConcernReason('unable_to_confirm', copy), 'unable_to_assess');
    assert.equal(effectivenessStatusForConcernReason('bp_above_target', copy), 'no');
  });
});
