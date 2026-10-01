import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  VALACYCLOVIR_COLD_SORE_RENAL_RULES,
  extractRenalDosingFromMarkdown,
  formatRenalRangeLabel,
  formatRenalRuleSummary,
  getApplicableRule,
  parseFieldLine,
  parseRenalDosingRulesJson,
  splitConfiguration,
  validateRenalDosingRules,
} from './renal-dosing';

const valacyclovirJson = JSON.stringify(VALACYCLOVIR_COLD_SORE_RENAL_RULES);

describe('renal dosing parser', () => {
  it('captures everything after the first colon', () => {
    const parsed = parseFieldLine(
      'Renal reason: CrCl ≥50 mL/min: 2000 mg PO every 12 hours for 2 doses',
    );
    assert.equal(
      parsed?.value,
      'CrCl ≥50 mL/min: 2000 mg PO every 12 hours for 2 doses',
    );
  });

  it('parses the valacyclovir structured rules and matches CrCl 37 to 1000 mg', () => {
    const parsed = parseRenalDosingRulesJson(valacyclovirJson);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.rules.length, 4);
    assert.equal(validateRenalDosingRules(parsed.rules).length, 0);
    assert.equal(getApplicableRule(37, parsed.rules)?.doseAmount, 1000);
    assert.equal(getApplicableRule(50, parsed.rules)?.doseAmount, 2000);
    assert.equal(getApplicableRule(9, parsed.rules)?.doseAmount, 500);
    assert.equal(getApplicableRule(9, parsed.rules)?.frequency, 'Single dose');
  });

  it('rejects malformed JSON and overlapping ranges', () => {
    const malformed = parseRenalDosingRulesJson('[{min:50}]');
    assert.equal(malformed.ok, false);
    const overlap = parseRenalDosingRulesJson(
      JSON.stringify([
        VALACYCLOVIR_COLD_SORE_RENAL_RULES[1],
        { ...VALACYCLOVIR_COLD_SORE_RENAL_RULES[1], max: 40 },
      ]),
    );
    assert.equal(overlap.ok, true);
    if (!overlap.ok) return;
    assert.ok(validateRenalDosingRules(overlap.rules).some((issue) => /overlap/i.test(issue.message)));
  });

  it('extracts renal fields from a one-line-per-field markdown block', () => {
    const block = `## Treatment
Medication: Valacyclovir 1 g
Renal adjustment: Yes
Renal reason: CrCl ≥50 mL/min: 2000 mg PO every 12 hours for 2 doses; CrCl 30 to <50 mL/min: 1000 mg PO every 12 hours for 2 doses
Renal dosing basis: CrCl
Renal dosing rules: ${valacyclovirJson}
Hepatic adjustment: No`;
    const extracted = extractRenalDosingFromMarkdown(block);
    assert.equal(extracted.renalAdjustment, 'Yes');
    assert.equal(extracted.renalSourceBasis, 'CrCl');
    assert.equal(extracted.renalDosingBasis, 'CrCl');
    assert.equal(extracted.parseError, null);
    assert.equal(extracted.renalDosingRules.length, 4);
    assert.equal(splitConfiguration(extracted.renalAdjustmentReason).length, 2);
    assert.equal(
      formatRenalRangeLabel(extracted.renalDosingRules[1], 'CrCl'),
      'CrCl 30 to <50 mL/min',
    );
    assert.equal(
      formatRenalRuleSummary(extracted.renalDosingRules[1]),
      '1000 mg · Twice daily (BID) · 2 doses',
    );
  });

  it('forces NONE and empty rules when renal adjustment is No', () => {
    const extracted = extractRenalDosingFromMarkdown(`Renal adjustment: No
Renal reason:
Renal source basis: NONE
Renal dosing basis: NONE
Renal dosing rules: []`);
    assert.equal(extracted.renalSourceBasis, 'NONE');
    assert.equal(extracted.renalDosingBasis, 'NONE');
    assert.deepEqual(extracted.renalDosingRules, []);
  });

  it('parses new eGFR operational rules with CrCl source basis', () => {
    const extracted = extractRenalDosingFromMarkdown(`Renal adjustment: Yes
Renal source basis: CrCl
Renal reason: eGFR ≥50 mL/min/1.73 m²: 2000 mg PO every 12 hours for 2 doses; eGFR 30 to <50 mL/min/1.73 m²: 1000 mg PO every 12 hours for 2 doses
Renal dosing basis: eGFR
Renal dosing rules: ${valacyclovirJson}`);
    assert.equal(extracted.renalSourceBasis, 'CrCl');
    assert.equal(extracted.renalDosingBasis, 'eGFR');
    assert.equal(extracted.renalDosingRules.length, 4);
  });
});
