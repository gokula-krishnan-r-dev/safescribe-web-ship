import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import {
  applyDrugToMedication,
  inferredRouteFromProduct,
  resolveMedicationSigDefaults,
  shouldPreserveDirections,
} from './medication-regimen-model';

const ramipril: DrugSearchResult = {
  id: 'ccdd-ramipril-10',
  brandName: 'PMSC-Ramipril',
  genericName: 'ramipril',
  strength: '10 mg',
  dosageForm: 'Oral Capsule',
  label: 'PMSC-Ramipril 10 mg Oral Capsule',
  source: 'ccdd',
  codeDisplay: 'DIN 02486539',
};

describe('manual product replacement', () => {
  it('preserves SIG when ingredient, strength, and form stay the same', () => {
    const added = applyDrugToMedication(null, ramipril);
    added.normalized.directions = 'Take 1 capsule by mouth once daily';
    assert.equal(shouldPreserveDirections(added, ramipril), true);
    const next = applyDrugToMedication(added, ramipril);
    assert.equal(next.normalized.directions, 'Take 1 capsule by mouth once daily');
  });

  it('clears SIG when strength changes', () => {
    const added = applyDrugToMedication(null, ramipril);
    added.normalized.directions = 'Take 1 capsule by mouth once daily';
    const stronger = { ...ramipril, id: 'ccdd-ramipril-20', strength: '20 mg' };
    assert.equal(shouldPreserveDirections(added, stronger), false);
    const next = applyDrugToMedication(added, stronger);
    assert.equal(next.normalized.directions, null);
  });

  it('infers oral route and capsule unit from a CCDD oral capsule', () => {
    const added = applyDrugToMedication(null, ramipril);
    assert.equal(added.normalized.route, 'Oral');
    assert.equal(added.normalized.dosageForm, 'Oral Capsule');
    assert.equal(added.normalized.doseUnit, 'capsule');
    assert.equal(inferredRouteFromProduct(ramipril), 'Oral');
  });

  it('infers oral route and tablet unit from an oral tablet', () => {
    const metformin: DrugSearchResult = {
      id: 'ccdd-metformin-500',
      brandName: 'METFORMIN',
      genericName: 'metformin hydrochloride',
      strength: '500 mg',
      dosageForm: 'Oral Tablet',
      label: 'metformin hydrochloride · METFORMIN',
      source: 'ccdd',
      codeDisplay: 'DIN 02233311',
    };
    const added = applyDrugToMedication(null, metformin);
    assert.equal(added.normalized.route, 'Oral');
    assert.equal(added.normalized.dosageForm, 'Oral Tablet');
    assert.equal(added.normalized.doseUnit, 'tablet');
  });

  it('resolves oral from dosage form when the stored route is missing', () => {
    const concertA = applyDrugToMedication(null, {
      id: 'ccdd-concerta-36',
      brandName: 'CONCERTA',
      genericName: 'methylphenidate hydrochloride',
      strength: '36 mg',
      dosageForm: 'Oral Tablet',
      label: 'methylphenidate hydrochloride · CONCERTA',
      source: 'ccdd',
      codeDisplay: 'DIN 02247732',
    });
    concertA.normalized.route = null;
    concertA.clinicalIdentity = {
      ...concertA.clinicalIdentity!,
      route: null,
    };
    const defaults = resolveMedicationSigDefaults(concertA);
    assert.equal(defaults.route, 'Oral');
    assert.equal(defaults.dosageForm, 'Oral Tablet');
    assert.equal(defaults.doseUnit, 'tablet');
  });

  it('infers inhalation from Ventolin HFA when dosage form is missing', () => {
    const ventolin: DrugSearchResult = {
      id: 'ccdd-ventolin-hfa',
      brandName: 'VENTOLIN HFA',
      genericName: 'salbutamol',
      strength: '100 mcg',
      dosageForm: '',
      label: 'salbutamol · VENTOLIN HFA',
      source: 'ccdd',
      codeDisplay: 'DIN 02241497',
    };
    const added = applyDrugToMedication(null, ventolin);
    assert.equal(inferredRouteFromProduct(ventolin), 'Inhalation');
    assert.equal(added.normalized.route, 'Inhalation');
    assert.equal(added.normalized.doseUnit, 'puff');
  });
});
