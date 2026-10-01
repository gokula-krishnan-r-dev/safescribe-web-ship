import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyParsedSigOverride,
  applyProductSigDefaults,
  formatParsedSigLine,
  parseCurrentDirections,
} from './medication-sig-parse';

describe('parseCurrentDirections', () => {
  it('parses a complete oral SIG', () => {
    const parsed = parseCurrentDirections('Take 1 capsule by mouth once daily');
    assert.equal(parsed.status, 'parsed');
    assert.equal(parsed.doseQuantity, 1);
    assert.equal(parsed.doseUnit, 'capsule');
    assert.equal(parsed.route, 'oral');
    assert.equal(parsed.frequencyDisplay, 'once daily');
    assert.equal(formatParsedSigLine(parsed), '1 capsule · oral · once daily');
  });

  it('does not invent a SIG from product strength alone', () => {
    const parsed = parseCurrentDirections('Ramipril 10 mg');
    assert.notEqual(parsed.status, 'parsed');
    assert.equal(parsed.frequencyDisplay, undefined);
    assert.equal(parsed.doseQuantity, undefined);
  });

  it('returns empty for blank directions', () => {
    assert.equal(parseCurrentDirections('').status, 'empty');
    assert.equal(parseCurrentDirections('  ').status, 'empty');
  });

  it('marks only the missing structured field', () => {
    const parsed = parseCurrentDirections('Take 1 capsule once daily');
    assert.equal(parsed.status, 'partial');
    assert.deepEqual(parsed.missing, ['route']);
    assert.equal(formatParsedSigLine(parsed), '1 capsule · once daily');
  });

  it('parses BID and worded dose', () => {
    const parsed = parseCurrentDirections('Take two tablets by mouth twice daily');
    assert.equal(parsed.status, 'parsed');
    assert.equal(parsed.doseQuantity, 2);
    assert.equal(parsed.doseUnit, 'tablet');
    assert.equal(parsed.frequencyCode, 'BID');
  });

  it('uses the selected product route when the SIG omits it', () => {
    const parsed = applyProductSigDefaults(parseCurrentDirections('one tab once daily'), {
      route: 'Oral',
      doseUnit: 'tablet',
    });
    assert.equal(parsed.route, 'oral');
    assert.equal(parsed.doseUnit, 'tablet');
    assert.equal(parsed.missing.includes('route'), false);
    assert.equal(parsed.status, 'parsed');
    assert.equal(formatParsedSigLine(parsed), '1 tablet · oral · once daily');
  });

  it('infers inhalation from a puff SIG even without product hints', () => {
    const parsed = applyProductSigDefaults(parseCurrentDirections('one pf qid prn'), {});
    assert.equal(parsed.doseUnit, 'puff');
    assert.equal(parsed.route, 'inhalation');
    assert.equal(parsed.status, 'parsed');
    assert.equal(formatParsedSigLine(parsed), '1 puff · inhalation · four times daily as needed');
  });

  it('parses pf as puff and qid prn as four times daily as needed', () => {
    const parsed = parseCurrentDirections('one pf qid prn');
    assert.equal(parsed.doseQuantity, 1);
    assert.equal(parsed.doseUnit, 'puff');
    assert.equal(parsed.frequencyDisplay, 'four times daily');
    assert.equal(parsed.prn, true);
    assert.equal(formatParsedSigLine(parsed), '1 puff · four times daily as needed');
  });

  it('keeps pharmacist dose edits when the SIG text still omits them', () => {
    const fromText = parseCurrentDirections('qid prn');
    const merged = applyParsedSigOverride(fromText, { doseQuantity: 1, doseUnit: 'puff', route: 'inhalation' });
    assert.equal(merged.doseQuantity, 1);
    assert.equal(merged.doseUnit, 'puff');
    assert.equal(merged.route, 'inhalation');
    assert.equal(merged.status, 'parsed');
    assert.equal(formatParsedSigLine(merged), '1 puff · inhalation · four times daily as needed');
  });

  it('parses qid prn as four times daily as needed', () => {
    const parsed = parseCurrentDirections('shake well and inhale 2 puffs qid prn');
    assert.equal(parsed.doseQuantity, 2);
    assert.equal(parsed.doseUnit, 'puff');
    assert.equal(parsed.route, 'inhalation');
    assert.equal(parsed.frequencyDisplay, 'four times daily');
    assert.equal(parsed.frequencyCode, 'QID');
    assert.equal(parsed.prn, true);
    assert.equal(parsed.missing.includes('route'), false);
    assert.equal(parsed.status, 'parsed');
    assert.equal(formatParsedSigLine(parsed), '2 puff · inhalation · four times daily as needed');
  });

  it('parses as needed without a scheduled frequency', () => {
    const parsed = parseCurrentDirections('inhale 2 puffs prn');
    assert.equal(parsed.prn, true);
    assert.equal(parsed.frequencyDisplay, undefined);
    assert.equal(parsed.missing.includes('frequency'), false);
    assert.equal(formatParsedSigLine(parsed), '2 puff · inhalation · as needed');
  });

  it('parses inhale as inhalation and does not leave route missing', () => {
    const parsed = parseCurrentDirections('inhale one puff four times a day');
    assert.equal(parsed.doseQuantity, 1);
    assert.equal(parsed.doseUnit, 'puff');
    assert.equal(parsed.route, 'inhalation');
    assert.equal(parsed.frequencyDisplay, 'four times daily');
    assert.equal(parsed.missing.includes('route'), false);
    assert.equal(parsed.status, 'parsed');
  });

  it('fills inhalation from HFA product when the SIG omits route', () => {
    const parsed = applyProductSigDefaults(parseCurrentDirections('2 puffs four times daily as needed'), {
      dosageForm: 'HFA',
      label: 'salbutamol · VENTOLIN HFA',
    });
    assert.equal(parsed.doseUnit, 'puff');
    assert.equal(parsed.route, 'inhalation');
    assert.equal(parsed.prn, true);
    assert.equal(parsed.missing.includes('route'), false);
    assert.equal(
      formatParsedSigLine(parsed),
      '2 puff · inhalation · four times daily as needed',
    );
  });

  it('fills puff and inhalation for one pf qid prn on Ventolin HFA', () => {
    const parsed = applyProductSigDefaults(parseCurrentDirections('one pf qid prn'), {
      dosageForm: 'HFA',
      label: 'salbutamol · VENTOLIN HFA',
    });
    assert.equal(parsed.doseQuantity, 1);
    assert.equal(parsed.doseUnit, 'puff');
    assert.equal(parsed.route, 'inhalation');
    assert.equal(parsed.prn, true);
    assert.equal(parsed.status, 'parsed');
    assert.equal(formatParsedSigLine(parsed), '1 puff · inhalation · four times daily as needed');
  });

  it('fills oral from Oral Tablet even when the route field is empty', () => {
    const parsed = applyProductSigDefaults(parseCurrentDirections('TAKE ONE TABLET ONCE A DAY'), {
      dosageForm: 'Oral Tablet',
      label: 'methylphenidate hydrochloride · CONCERTA',
    });
    assert.equal(parsed.doseQuantity, 1);
    assert.equal(parsed.doseUnit, 'tablet');
    assert.equal(parsed.frequencyDisplay, 'once daily');
    assert.equal(parsed.route, 'oral');
    assert.equal(parsed.missing.includes('route'), false);
    assert.equal(parsed.status, 'parsed');
    assert.equal(formatParsedSigLine(parsed), '1 tablet · oral · once daily');
  });
});
