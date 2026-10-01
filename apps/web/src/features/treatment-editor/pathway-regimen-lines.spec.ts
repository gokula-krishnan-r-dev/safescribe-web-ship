import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyRegimenLine } from '../consultations/add-treatment/constants';
import { createEmptyRegimen } from '../pathways/treatment-option-editor-constants';
import type { ClinicalTreatment } from '../pathways/types';
import {
  linesFromTreatment,
  linesToRegimen,
  persistDoseTo,
  serializeRegimenLines,
} from './pathway-regimen-lines';

function treatment(patch: Partial<ClinicalTreatment> = {}): ClinicalTreatment {
  return {
    id: 'tx-1',
    pathwayId: 'pw-1',
    category: 'PRESCRIPTION',
    recommendationLevel: 'FIRST_LINE',
    medicationName: 'VALTREX',
    genericName: 'valacyclovir',
    brandName: 'VALTREX',
    strength: '1 g',
    dose: '2',
    route: 'Oral',
    frequency: 'BID - Two times daily',
    duration: '1 day',
    quantity: null,
    directions: null,
    maxDose: null,
    eligibility: null,
    clinicalIndication: null,
    clinicalNotes: null,
    guidelineReference: null,
    evidenceStrength: null,
    renalAdjustment: null,
    hepaticAdjustment: null,
    pregnancyNotes: null,
    breastfeedingNotes: null,
    pregnancyReason: null,
    renalAdjustmentReason: null,
    hepaticAdjustmentReason: null,
    monitoringReason: null,
    counsellingNotes: null,
    followUpAdvice: null,
    ageRestriction: null,
    provinceAvailability: null,
    warnings: [],
    interactions: [],
    monitoring: null,
    isAiGenerated: false,
    approved: true,
    isActive: true,
    archivedAt: null,
    displayOrder: 0,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

describe('pathway regimen lines', () => {
  it('keeps an opened empty dose range in editor state until a value is entered', () => {
    const base = createEmptyRegimen();
    base.dose = '2';
    base.administrationUnit = 'Tablet(s)';
    base.frequency = 'BID - Two times daily';
    const opened = emptyRegimenLine({
      doseFrom: '2',
      doseTo: '',
      form: 'Tablet(s)',
      frequency: 'BID - Two times daily',
    });
    const next = linesToRegimen([opened], base);
    assert.equal(next.dose, '2');
    assert.equal(opened.doseTo, '');
    assert.equal(persistDoseTo(''), null);
    assert.equal(persistDoseTo('3'), '3');
  });

  it('persists sequential THEN schedules instead of dropping extra lines', () => {
    const lines = [
      emptyRegimenLine({
        doseFrom: '2',
        form: 'Tablet(s)',
        frequency: 'BID - Two times daily',
        durationValue: '1',
        durationUnit: 'DAY',
      }),
      emptyRegimenLine({
        doseFrom: '1',
        form: 'Tablet(s)',
        frequency: 'QD - Once daily',
        durationValue: '5',
        durationUnit: 'DAY',
      }),
    ];
    const stored = serializeRegimenLines(lines);
    assert.equal(stored.length, 2);
    assert.equal(stored[1]?.doseFrom, '1');
    assert.equal(stored[1]?.frequency, 'QD - Once daily');

    const hydrated = linesFromTreatment(
      treatment({
        metadata: {
          regimens: [
            {
              id: 'r1',
              label: 'Standard',
              dose: '2',
              administrationUnit: 'Tablet(s)',
              productForm: 'Tablet',
              frequency: 'BID - Two times daily',
              route: 'Oral',
              durationValue: '1',
              durationUnit: 'Days',
            },
          ],
          regimenLines: stored,
        },
      }),
      createEmptyRegimen(),
    );
    assert.equal(hydrated.length, 2);
    assert.equal(hydrated[1]?.doseFrom, '1');
  });

  it('round-trips a completed dose range on the first line', () => {
    const lines = [
      emptyRegimenLine({
        doseFrom: '1',
        doseTo: '2',
        form: 'Tablet(s)',
        frequency: 'QD - Once daily',
      }),
    ];
    const stored = serializeRegimenLines(lines);
    assert.equal(stored[0]?.doseTo, '2');
    const base = createEmptyRegimen();
    const regimen = linesToRegimen(lines, base);
    assert.equal(regimen.dose, '1–2');
  });

  it('maps supply duration on the first line into the stored pathway regimen', () => {
    const base = createEmptyRegimen();
    base.administrationUnit = 'Tablet(s)';
    base.productForm = 'Tablet';
    base.route = 'Oral';
    const next = linesToRegimen(
      [
        emptyRegimenLine({
          doseFrom: '1',
          form: 'Tablet(s)',
          frequency: 'BID - Two times daily',
          durationValue: '7',
          durationUnit: 'DAY',
          prn: true,
        }),
      ],
      base,
    );
    assert.equal(next.durationValue, '7');
    assert.equal(next.durationUnit, 'Days');
    assert.equal(next.frequency, 'BID - Two times daily');
    const stored = serializeRegimenLines([
      emptyRegimenLine({
        doseFrom: '1',
        form: 'Tablet(s)',
        frequency: 'BID - Two times daily',
        durationValue: '7',
        durationUnit: 'DAY',
        prn: true,
      }),
    ]);
    assert.equal(stored[0]?.prn, true);
    assert.equal(stored[0]?.durationValue, '7');
    assert.equal(stored[0]?.durationUnit, 'DAY');
  });
});
