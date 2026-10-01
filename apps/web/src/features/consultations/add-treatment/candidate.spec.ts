import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCandidateSafety,
  isGuidedDuplicate,
  slimTreatmentsForEvaluate,
} from './candidate';
import type { TreatmentRecommendation } from '../types';
import type { TreatmentCandidateEvaluateResponse } from './candidate';

describe('treatment candidate client helpers', () => {
  it('treats pathway option matches as guided duplicates', () => {
    assert.equal(
      isGuidedDuplicate({
        matchType: 'EXACT_PATHWAY_OPTION',
        blocking: true,
        existingPathwayOptionId: 'opt-1',
      }),
      true,
    );
    assert.equal(
      isGuidedDuplicate({
        matchType: 'EXACT_SELECTED_TREATMENT',
        blocking: true,
        existingTreatmentInstanceId: 'draft-1',
      }),
      false,
    );
  });

  it('attaches evaluation identity and allergy flags without requiring a pathway option id', () => {
    const base = {
      priority: 1,
      medicationName: 'oseltamivir (oseltamivir phosphate)',
      confidence: 100,
      source: 'ccdd',
    } as TreatmentRecommendation;
    const result: TreatmentCandidateEvaluateResponse = {
      candidate: {
        treatmentInstanceId: 'draft_123',
        medicationConceptId: 'med_oseltamivir',
        normalizedBaseIngredientConceptIds: ['oseltamivir'],
        normalizationStatus: 'RESOLVED',
        patientContextVersion: 'abc',
      },
      duplicate: { matchType: 'NONE', blocking: false },
      safety: {
        evaluationId: 'eval_1',
        consultationId: 'c1',
        treatmentInstanceId: 'draft_123',
        source: 'SEARCH',
        patientContextVersion: 'abc',
        status: 'AVOID',
        evaluatedAt: '2026-08-22T00:00:00.000Z',
        allergyBlocked: true,
        allergyWarning: {
          patientAllergy: 'oseltamivir',
          prescribedDrug: base.medicationName,
          reason: 'Patient has a recorded allergy to oseltamivir.',
        },
      },
    };
    const attached = applyCandidateSafety(base, result);
    assert.equal(attached.treatmentInstanceId, 'draft_123');
    assert.equal(attached.allergyBlocked, true);
    assert.equal(attached.pathwayTreatmentId, undefined);
    assert.equal(attached.safetyEvaluationId, 'eval_1');
  });

  it('replaces a stale allergy warning when the new evaluation has none', () => {
    const base = {
      priority: 1,
      medicationName: 'MAXALT (rizatriptan 10 mg)',
      confidence: 80,
      source: 'pathway',
      allergyBlocked: true,
      allergyWarning: {
        patientAllergy: '',
        prescribedDrug: 'MAXALT (rizatriptan 10 mg)',
        reason: 'Ondansetron has matched pregnancy.',
      },
    } as TreatmentRecommendation;
    const result: TreatmentCandidateEvaluateResponse = {
      candidate: {
        treatmentInstanceId: 'draft_maxalt',
        medicationConceptId: 'med_rizatriptan',
        normalizedBaseIngredientConceptIds: ['rizatriptan'],
        normalizationStatus: 'RESOLVED',
        patientContextVersion: 'abc',
      },
      duplicate: { matchType: 'NONE', blocking: false },
      safety: {
        evaluationId: 'eval_2',
        consultationId: 'c1',
        treatmentInstanceId: 'draft_maxalt',
        source: 'MANUAL',
        patientContextVersion: 'abc',
        status: 'REVIEW_REQUIRED',
        evaluatedAt: '2026-08-29T00:00:00.000Z',
        allergyBlocked: false,
        pregnancyWarning: {
          active: true,
          message: 'rizatriptan has matched a confirmed pregnancy.',
        },
      },
    };
    const attached = applyCandidateSafety(base, result);
    assert.equal(attached.allergyBlocked, false);
    assert.equal(attached.allergyWarning, undefined);
    assert.match(attached.pregnancyWarning?.message ?? '', /rizatriptan/i);
  });

  it('sends catalog identity rather than display-name-only rows', () => {
    const rows = slimTreatmentsForEvaluate([
      {
        priority: 1,
        medicationName: 'oseltamivir phosphate',
        confidence: 80,
        pathwayTreatmentId: 'pathway_option_oseltamivir',
        source: 'pathway',
        allergyBlocked: true,
        allergyWarning: {
          patientAllergy: 'oseltamivir',
          prescribedDrug: 'oseltamivir phosphate',
          reason: 'Patient has a recorded allergy to oseltamivir.',
        },
      },
    ]);
    assert.equal(rows[0].pathwayTreatmentId, 'pathway_option_oseltamivir');
    assert.equal(rows[0].allergyBlocked, true);
  });
});
