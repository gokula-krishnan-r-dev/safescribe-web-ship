import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VALACYCLOVIR_COLD_SORE_RENAL_RULES } from '@safescript/shared';
import {
  buildRenalSafetyView,
  deriveShortReference,
  extractPatientRenalMetric,
  matchRenalTier,
  parseRenalDosingTiers,
} from './renal-safety-model';

const valacyclovirReason = [
  'CrCl ≥50 mL/min: 2000 mg every 12 hours for 2 doses',
  'CrCl 30 to <50 mL/min: 1000 mg every 12 hours for 2 doses',
  'CrCl 10 to <30 mL/min: 500 mg every 12 hours for 2 doses',
  'CrCl <10 mL/min: 500 mg once',
  'Hemodialysis: Give the applicable dose after hemodialysis on dialysis days.',
].join('\n');

describe('renal safety view-model', () => {
  it('extracts CrCl from labs and does not substitute eGFR', () => {
    const metric = extractPatientRenalMetric({
      labsText: 'eGFR 42 mL/min/1.73 m², CrCl 37 mL/min',
      renalAdjustmentReason: valacyclovirReason,
      standardRegimenSummary: '2000 mg every 12 hours for 2 doses',
    });
    assert.equal(metric?.basis, 'CrCl');
    assert.equal(metric?.value, 37);
  });

  it('uses the newest dated eGFR when a historical series is stored', () => {
    const metric = extractPatientRenalMetric({
      extractedLabs: [
        { test: 'eGFR', value: '42', unit: 'mL/min/1.73 m²', observedDate: '2024-03-01' },
        { test: 'eGFR', value: '22', unit: 'mL/min/1.73 m²', observedDate: '2025-08-20' },
      ],
      renalDosingBasis: 'eGFR',
      standardRegimenSummary: 'standard',
    });
    assert.equal(metric?.basis, 'eGFR');
    assert.equal(metric?.value, 22);
  });

  it('matches the 30 to <50 band for CrCl 37 and enables apply at 1 g tablet', () => {
    const view = buildRenalSafetyView({
      renalAdjustmentRequired: true,
      renalAdjustmentReason: valacyclovirReason,
      renalDosingBasis: 'CrCl',
      renalDosingRules: VALACYCLOVIR_COLD_SORE_RENAL_RULES,
      labsText: 'CrCl 37 mL/min',
      productStrength: '1 g',
      productLabel: 'VALTREX / valacyclovir 1 g',
      standardRegimenSummary: '2000 mg every 12 hours for 2 doses',
    });
    assert.equal(view.state, 'ADJUSTMENT_RECOMMENDED');
    assert.equal(view.patient?.displayValue, '37');
    assert.match(view.recommendedRegimenSummary ?? '', /1000 mg/);
    assert.equal(view.apply?.tabletCount, 1);
    assert.equal(view.apply?.productMismatch, false);
    assert.doesNotMatch(view.recommendedRegimenSummary ?? '', /moderate impairment/i);
  });

  it('requires a matching product strength instead of splitting tablets', () => {
    const view = buildRenalSafetyView({
      renalAdjustmentRequired: true,
      renalAdjustmentReason: valacyclovirReason,
      renalDosingBasis: 'CrCl',
      renalDosingRules: VALACYCLOVIR_COLD_SORE_RENAL_RULES,
      labsText: 'CrCl 24 mL/min',
      productStrength: '1 g',
      productLabel: 'valacyclovir 1 g tablet',
      standardRegimenSummary: '2000 mg every 12 hours for 2 doses',
    });
    assert.equal(view.state, 'PRODUCT_REQUIRED');
    assert.equal(view.apply?.tabletCount, null);
  });

  it('accepts a 500 mg tablet for the 10 to <30 band', () => {
    const view = buildRenalSafetyView({
      renalAdjustmentRequired: true,
      renalAdjustmentReason: valacyclovirReason,
      renalDosingBasis: 'CrCl',
      renalDosingRules: VALACYCLOVIR_COLD_SORE_RENAL_RULES,
      labsText: 'CrCl 21 mL/min',
      productStrength: '500 mg',
      productLabel: 'valacyclovir 500 mg tablet',
      standardRegimenSummary: '2000 mg every 12 hours for 2 doses',
    });
    assert.equal(view.state, 'ADJUSTMENT_RECOMMENDED');
    assert.equal(view.apply?.tabletCount, 1);
    assert.equal(view.apply?.productMismatch, false);
    assert.match(view.recommendedRegimenSummary ?? '', /500 mg/);
  });

  it('does not invent a recommendation when no structured band matches', () => {
    const view = buildRenalSafetyView({
      renalAdjustmentRequired: true,
      renalWarningActive: true,
      renalWarningMessage: 'Adjust oral acyclovir dosing and monitor neurotoxicity risk.',
      labsText: 'eGFR 22 mL/min/1.73 m²',
      standardRegimenSummary: '400 mg four times daily for 5 days',
    });
    assert.equal(view.state, 'NO_STRUCTURED_RULE');
    assert.equal(view.recommendedRegimenSummary, undefined);
  });

  it('does not apply a dose from free-text renal reason when structured rules are missing', () => {
    const view = buildRenalSafetyView({
      renalAdjustmentRequired: true,
      renalAdjustmentReason: valacyclovirReason,
      labsText: 'CrCl 37 mL/min',
      productStrength: '1 g',
      standardRegimenSummary: '2000 mg every 12 hours for 2 doses',
    });
    assert.equal(view.state, 'NO_STRUCTURED_RULE');
    assert.equal(view.recommendedRegimenSummary, undefined);
  });

  it('requires CrCl when structured rules are CrCl-based and only eGFR is available', () => {
    const view = buildRenalSafetyView({
      renalAdjustmentRequired: true,
      renalDosingBasis: 'CrCl',
      renalDosingRules: VALACYCLOVIR_COLD_SORE_RENAL_RULES,
      labsText: 'eGFR 42 mL/min/1.73 m²',
      standardRegimenSummary: '2000 mg every 12 hours for 2 doses',
    });
    assert.equal(view.state, 'RENAL_VALUE_REQUIRED');
    assert.equal(view.patient?.basis, 'eGFR');
  });

  it('parses published renal-reason tiers without guessing a fallback band', () => {
    const tiers = parseRenalDosingTiers(valacyclovirReason);
    assert.ok(tiers.length >= 4);
    assert.equal(matchRenalTier(tiers, 37)?.regimen, '1000 mg every 12 hours for 2 doses');
    assert.equal(matchRenalTier(tiers, 50)?.regimen, '2000 mg every 12 hours for 2 doses');
    assert.equal(matchRenalTier(tiers, 9)?.regimen, '500 mg once');
  });

  it('keeps the full colchicine eGFR 30 to <50 sentence instead of splitting on eGFR', () => {
    const reason =
      'eGFR ≥50 mL/min/1.73 m²: standard acute-flare regimen may be considered when otherwise appropriate; eGFR 30 to <50 mL/min/1.73 m²: Alberta gout guidance recommends reduced ongoing colchicine dosing and greater caution, but does not provide a validated eGFR adjustment for the 1.2 mg followed by 0.6 mg acute loading regimen, therefore pharmacist review is required before using the standard acute-flare regimen; eGFR <30 mL/min/1.73 m²: Alberta gout guidance recommends avoiding colchicine for the acute flare and using corticosteroid treatment instead';
    const tiers = parseRenalDosingTiers(reason);
    assert.equal(tiers.length, 3);
    const mid = tiers.find((tier) => /30 to\s*</i.test(tier.label));
    assert.match(mid?.regimen ?? '', /validated eGFR adjustment for the 1\.2 mg/);
    assert.match(mid?.regimen ?? '', /pharmacist review is required/);
    assert.doesNotMatch(mid?.regimen ?? '', /\.\.\./);

    const view = buildRenalSafetyView({
      renalAdjustmentRequired: true,
      renalAdjustmentReason: reason,
      renalDosingBasis: 'eGFR',
      renalDosingRules: [],
      labsText: 'eGFR 22 mL/min/1.73 m²',
      standardRegimenSummary: '0.6 mg at symptom onset',
      guidelineReference:
        'Alberta Health Services / Specialist LINK, Primary Care Gout Pathway, Rheumatology; Pharmascience Inc., pms-COLCHICINE Canadian Product Monograph / Health Canada-authorized product information',
    });
    assert.equal(view.state, 'NO_STRUCTURED_RULE');
    assert.equal(view.apply, undefined);
    assert.equal(view.tiers[1]?.regimen, mid?.regimen);
    assert.equal(view.clinicalSource?.shortLabel, 'Alberta Primary Care Gout Pathway');
    assert.match(view.clinicalSource?.fullReference ?? '', /pms-COLCHICINE/);
  });

  it('derives a compact pathway source label from a long guideline citation', () => {
    assert.equal(
      deriveShortReference(
        'Alberta Health Services / Specialist LINK, Primary Care Gout Pathway, Rheumatology; Pharmascience Inc., pms-COLCHICINE',
      ),
      'Alberta Primary Care Gout Pathway',
    );
  });
});
