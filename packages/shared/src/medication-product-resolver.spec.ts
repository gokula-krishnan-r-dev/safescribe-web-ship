import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collapseEquivalentCandidates,
  parseProductName,
  resolveMedicationFromCandidates,
  sameProductIdentity,
  shouldPromptMedicationMatch,
  shouldOpenMedicationMatchDialog,
  pharmacistCodeLabel,
  type MedicationResolverCandidate,
} from './medication-product-resolver';

function candidate(patch: Partial<MedicationResolverCandidate> & { id: string; label: string }): MedicationResolverCandidate {
  return {
    brandName: patch.brandName ?? patch.label,
    genericName: patch.genericName ?? null,
    strength: patch.strength ?? '5 mg',
    dosageForm: patch.dosageForm ?? 'Oral Tablet',
    din: patch.din ?? null,
    conceptType: patch.conceptType ?? 'mp',
    ...patch,
  };
}

describe('parseProductName', () => {
  it('detects manufacturer-prefixed products', () => {
    const parsed = parseProductName('AURO-FINASTERIDE 5MG TAB');
    assert.equal(parsed.isExplicitProduct, true);
    assert.equal(parsed.manufacturerPrefix, 'AURO');
    assert.equal(parsed.baseIngredientCandidate, 'finasteride');
  });

  it('treats generic INN input as not product-specific', () => {
    const parsed = parseProductName('omeprazole 20 mg capsule');
    assert.equal(parsed.isExplicitProduct, false);
  });
});

describe('sameProductIdentity', () => {
  it('matches AURO-FINASTERIDE variants and rejects Propecia', () => {
    assert.equal(sameProductIdentity('AURO-FINASTERIDE', 'AURO-FINASTERIDE 5 MG TAB'), true);
    assert.equal(sameProductIdentity('Propecia', 'AURO-FINASTERIDE'), false);
    assert.equal(sameProductIdentity('APO-OMEPRAZOLE', 'OMEPRAZOLE'), false);
  });
});

describe('resolveMedicationFromCandidates', () => {
  const auro = candidate({
    id: 'ccdd-mp-02405814',
    label: 'finasteride · AURO-FINASTERIDE',
    brandName: 'AURO-FINASTERIDE',
    genericName: 'finasteride',
    din: '02405814',
    conceptType: 'mp',
  });
  const propecia = candidate({
    id: 'ccdd-ntp-9000424',
    label: 'finasteride · Propecia',
    brandName: 'Propecia',
    genericName: 'finasteride',
    conceptType: 'ntp',
    codeDisplay: 'NTP: 9000424',
  });
  const apoOmeprazole = candidate({
    id: 'ccdd-mp-apo',
    label: 'omeprazole · APO-OMEPRAZOLE',
    brandName: 'APO-OMEPRAZOLE',
    genericName: 'omeprazole',
    strength: '20 mg',
    dosageForm: 'Oral Capsule',
    conceptType: 'mp',
  });
  const tevaOmeprazole = candidate({
    id: 'ccdd-mp-teva',
    label: 'omeprazole · TEVA-OMEPRAZOLE',
    brandName: 'TEVA-OMEPRAZOLE',
    genericName: 'omeprazole',
    strength: '20 mg',
    dosageForm: 'Oral Capsule',
    conceptType: 'mp',
  });
  const omeprazoleNtp = candidate({
    id: 'ccdd-ntp-omep',
    label: 'omeprazole 20 mg oral capsule',
    brandName: 'omeprazole',
    genericName: 'omeprazole',
    strength: '20 mg',
    dosageForm: 'Oral Capsule',
    conceptType: 'ntp',
  });

  it('auto-resolves exact DIN and keeps AURO product identity', () => {
    const result = resolveMedicationFromCandidates(
      { rawName: 'AURO-FINASTERIDE 5MG TAB', din: '02405814', strength: '5 mg', dosageForm: 'tablet' },
      [auro, propecia],
    );
    assert.equal(result.status, 'AUTO_RESOLVED');
    assert.equal(result.productIdentity.matchMethod, 'DIN_EXACT');
    assert.equal(result.productIdentity.brandName, 'AURO-FINASTERIDE');
    assert.equal(result.clinicalIdentity.ingredientNames[0], 'finasteride');
    assert.equal(shouldPromptMedicationMatch(result.status), false);
  });

  it('does not ask the pharmacist to choose Propecia for AURO-FINASTERIDE', () => {
    const result = resolveMedicationFromCandidates(
      { rawName: 'AURO-FINASTERIDE 5MG TAB', brandName: 'AURO-FINASTERIDE', strength: '5 mg', dosageForm: 'tablet' },
      [auro, propecia],
    );
    assert.equal(result.status, 'AUTO_RESOLVED');
    assert.equal(result.selectedCandidate?.id, auro.id);
    assert.equal(result.candidates.length, 0);
  });

  it('does not substitute another manufacturer when the exact product is missing', () => {
    const result = resolveMedicationFromCandidates(
      { rawName: 'APO-Omeprazole 20 mg', strength: '20 mg', dosageForm: 'capsule' },
      [tevaOmeprazole, omeprazoleNtp],
    );
    assert.equal(result.status, 'UNRESOLVED');
    assert.equal(result.reason, 'EXACT_PRODUCT_NOT_FOUND');
    assert.equal(result.productIdentity.sourceDisplayName, 'APO-Omeprazole 20 mg');
    assert.equal(result.clinicalIdentity.ingredientNames[0], 'omeprazole');
  });

  it('normalizes generic omeprazole without a manufacturer modal', () => {
    const result = resolveMedicationFromCandidates(
      { rawName: 'omeprazole 20 mg capsule', genericName: 'omeprazole', strength: '20 mg', dosageForm: 'capsule' },
      [apoOmeprazole, tevaOmeprazole, omeprazoleNtp],
    );
    assert.equal(result.status, 'AUTO_RESOLVED');
    assert.equal(shouldPromptMedicationMatch(result.status), false);
    assert.ok(
      result.productIdentity.matchMethod === 'GENERIC_NORMALIZED' ||
        result.productIdentity.matchMethod === 'PRODUCT_NAME_EXACT',
    );
    assert.equal(result.clinicalIdentity.ingredientNames[0], 'omeprazole');
  });

  it('asks only when release type is clinically distinct', () => {
    const tartrate = candidate({
      id: 'ccdd-ntp-tart',
      label: 'metoprolol tartrate 100 mg tablet',
      brandName: 'metoprolol tartrate',
      genericName: 'metoprolol tartrate',
      strength: '100 mg',
      dosageForm: 'Oral Tablet',
      conceptType: 'ntp',
    });
    const succinate = candidate({
      id: 'ccdd-ntp-succ',
      label: 'metoprolol succinate ER 100 mg tablet',
      brandName: 'metoprolol succinate',
      genericName: 'metoprolol succinate',
      strength: '100 mg',
      dosageForm: 'Extended Release Tablet',
      conceptType: 'ntp',
    });
    const result = resolveMedicationFromCandidates(
      { rawName: 'Metoprolol 100 mg', genericName: 'metoprolol', strength: '100 mg' },
      [tartrate, succinate],
    );
    assert.equal(result.status, 'PHARMACIST_REVIEW_REQUIRED');
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.some((c) => c.clinicalDifference === 'Extended release'));
  });

  it('auto-resolves Crestor when the same branded product is present', () => {
    const crestor = candidate({
      id: 'ccdd-mp-crestor',
      label: 'rosuvastatin · Crestor',
      brandName: 'Crestor',
      genericName: 'rosuvastatin',
      strength: '20 mg',
      dosageForm: 'Oral Tablet',
      din: '02245535',
    });
    const result = resolveMedicationFromCandidates(
      { rawName: 'Crestor 20 mg', strength: '20 mg', dosageForm: 'tablet' },
      [crestor, tevaOmeprazole],
    );
    assert.equal(result.status, 'AUTO_RESOLVED');
    assert.equal(result.productIdentity.sourceDisplayName, 'Crestor 20 mg');
    assert.equal(result.selectedCandidate?.id, crestor.id);
  });

  it('keeps Crestor when only other rosuvastatin manufacturers are found', () => {
    const apoRosuva = candidate({
      id: 'ccdd-mp-apo-rosuva',
      label: 'rosuvastatin · APO-ROSUVASTATIN',
      brandName: 'APO-ROSUVASTATIN',
      genericName: 'rosuvastatin',
      strength: '20 mg',
      dosageForm: 'Oral Tablet',
    });
    const result = resolveMedicationFromCandidates(
      { rawName: 'Crestor 20 mg', strength: '20 mg', dosageForm: 'tablet' },
      [apoRosuva],
    );
    assert.equal(result.status, 'UNRESOLVED');
    assert.equal(result.reason, 'EXACT_PRODUCT_NOT_FOUND');
    assert.equal(result.productIdentity.sourceDisplayName, 'Crestor 20 mg');
    assert.equal(result.clinicalIdentity.ingredientNames[0], 'rosuvastatin');
  });
});

describe('shouldOpenMedicationMatchDialog', () => {
  it('opens only for clinically distinct review or unmatched explicit products', () => {
    assert.equal(
      shouldOpenMedicationMatchDialog({ resolutionStatus: 'PHARMACIST_REVIEW_REQUIRED' }),
      true,
    );
    assert.equal(
      shouldOpenMedicationMatchDialog({
        resolutionStatus: 'UNRESOLVED',
        productIdentity: { isExplicitProduct: true },
      }),
      true,
    );
    assert.equal(shouldOpenMedicationMatchDialog({ resolutionStatus: 'AUTO_RESOLVED' }), false);
    assert.equal(
      shouldOpenMedicationMatchDialog({
        resolutionStatus: 'UNRESOLVED',
        productIdentity: { isExplicitProduct: false },
      }),
      false,
    );
    assert.equal(
      shouldOpenMedicationMatchDialog({ ccddMatchStatus: 'ambiguous' }),
      true,
    );
    assert.equal(
      shouldOpenMedicationMatchDialog({
        resolutionStatus: 'AUTO_RESOLVED',
        ccddMatchStatus: 'ambiguous',
      }),
      false,
    );
  });
});

describe('pharmacistCodeLabel', () => {
  it('shows DIN and strips NTP/CCDD jargon', () => {
    assert.equal(pharmacistCodeLabel('02405814', 'NTP: 9000424'), 'DIN: 02405814');
    assert.equal(pharmacistCodeLabel(null, 'NTP: 9000424'), null);
    assert.equal(pharmacistCodeLabel(null, 'DIN: 02405814'), 'DIN: 02405814');
  });
});
