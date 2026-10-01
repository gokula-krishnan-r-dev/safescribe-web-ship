import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VALACYCLOVIR_COLD_SORE_RENAL_RULES } from '@safescript/shared';
import type { DrugSearchResult } from '../consultations/medication-utils';
import type { TreatmentRecommendation } from '../consultations/types';
import {
  composeAdjustedRegimenTreatment,
  persistAdjustedRegimen,
} from './apply-renal-adjustment';

function tx(patch: Partial<TreatmentRecommendation> = {}): TreatmentRecommendation {
  return {
    priority: 1,
    medicationName: 'VALTREX',
    genericName: 'valacyclovir',
    brandName: 'VALTREX',
    strength: '1 g',
    productForm: 'Tablet',
    dose: '1',
    doseAmount: '1',
    doseUnit: 'Tablet(s)',
    frequency: 'At the first sign of symptoms',
    duration: '1 day',
    prn: false,
    route: 'Oral',
    quantity: '1 Tablet(s)',
    quantityUnit: 'Tablet(s)',
    refills: 0,
    confidence: 1,
    patientDirections: 'Take 1 g by mouth at the first sign of symptoms.',
    renalAdjustmentRequired: true,
    renalDosingBasis: 'CrCl',
    renalDosingRules: VALACYCLOVIR_COLD_SORE_RENAL_RULES,
    pathwayTreatmentId: 'tx-valacyclovir',
    ...patch,
  };
}

function drug(patch: Partial<DrugSearchResult> = {}): DrugSearchResult {
  return {
    id: 'ccdd-valacyclovir-500',
    brandName: 'valacyclovir',
    genericName: 'valacyclovir',
    strength: '500 mg',
    dosageForm: 'Tablet',
    label: 'Valacyclovir 500 mg tablet',
    source: 'ccdd',
    ...patch,
  };
}

const source = {
  renalAdjustmentRequired: true,
  renalDosingBasis: 'CrCl' as const,
  renalDosingRules: VALACYCLOVIR_COLD_SORE_RENAL_RULES,
  labsText: 'CrCl 21 mL/min',
  standardRegimenSummary: 'Take 1 g by mouth at the first sign of symptoms.',
};

describe('composeAdjustedRegimenTreatment', () => {
  it('applies the 500 mg product and renal directions together', () => {
    const result = composeAdjustedRegimenTreatment({
      treatment: tx(),
      drug: drug(),
      source,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const persisted = persistAdjustedRegimen(result.treatment, result.draft, result.view);
    assert.equal(persisted.strength, '500 mg');
    assert.equal(persisted.regimenSource, 'RENAL_ADJUSTED');
    assert.equal(persisted.pharmacistModified, true);
    assert.match(persisted.patientDirections ?? '', /500 mg/i);
    assert.doesNotMatch(persisted.patientDirections ?? '', /1 g/i);
    assert.equal(result.draft.lines[0]?.doseFrom, '1');
    assert.equal(persisted.renalValueUsed, 21);
  });

  it('rejects the original 1 g product for the 500 mg regimen', () => {
    const result = composeAdjustedRegimenTreatment({
      treatment: tx(),
      drug: drug({
        id: 'ccdd-valtrex-1g',
        brandName: 'VALTREX',
        strength: '1 g',
        label: 'VALTREX 1 g tablet',
      }),
      source,
    });
    assert.equal(result.ok, false);
  });
});
