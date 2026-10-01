import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TreatmentRecommendation } from './types';
import {
  applyInlineDraft,
  collapsedRegimenSummary,
  hydrateInlineDraft,
  isInlineDraftDirty,
  applyInlineDraftPatch,
  normalizeInlineDraft,
  productSummary,
  regimenFingerprint,
  validateInlineDraft,
} from './inline-prescription';

function tx(patch: Partial<TreatmentRecommendation> = {}): TreatmentRecommendation {
  return {
    priority: 1,
    medicationName: 'diclofenac potassium',
    genericName: 'diclofenac potassium',
    strength: '50 mg',
    dose: '1',
    doseAmount: '1',
    doseUnit: 'Tablet(s)',
    frequency: 'Every 6–8 hours',
    duration: '7 days',
    prn: true,
    route: 'Oral',
    quantity: '28 Tablet(s)',
    quantityUnit: 'Tablet(s)',
    refills: 0,
    confidence: 1,
    ...patch,
  };
}

describe('inline prescription draft', () => {
  it('hydrates the diclofenac mock into pharmacist-facing fields', () => {
    const draft = hydrateInlineDraft(tx());
    assert.equal(draft.lines[0]?.doseFrom, '1');
    assert.equal(draft.lines[0]?.form, 'Tablet(s)');
    assert.equal(draft.lines[0]?.frequency, 'Q6-8H - Every 6 to 8 hours');
    assert.equal(draft.lines[0]?.prn, true);
    assert.equal(draft.lines[0]?.durationValue, '7');
    assert.equal(draft.lines[0]?.durationUnit, 'DAY');
    assert.equal(draft.quantityValue, '28');
    assert.equal(draft.quantityUnit, 'Tablet(s)');
    assert.equal(draft.route, 'Oral');
    assert.equal(draft.productForm, 'Tablet');
    assert.equal(
      draft.patientDirections,
      'Take 1 tablet by mouth every 6 to 8 hours as needed for 7 days.',
    );
    assert.equal(productSummary(tx(), draft), '50 mg');
    assert.match(collapsedRegimenSummary(draft, tx()), /1 tablet \(50 mg\) by mouth every 6–8 hours as needed/);
    assert.match(collapsedRegimenSummary(draft, tx()), /7 days/);
  });

  it('does not mark a freshly hydrated draft as dirty', () => {
    const draft = hydrateInlineDraft(tx());
    assert.equal(isInlineDraftDirty(draft, draft), false);
  });

  it('detects dirty dose and quantity changes', () => {
    const saved = hydrateInlineDraft(tx());
    const dirtyDose = {
      ...saved,
      lines: [{ ...saved.lines[0], doseFrom: '2' }],
    };
    const dirtyQty = { ...saved, quantityValue: '30' };
    assert.equal(isInlineDraftDirty(dirtyDose, saved), true);
    assert.equal(isInlineDraftDirty(dirtyQty, saved), true);
  });

  it('keeps an opened empty dose range while the pharmacist fills the maximum', () => {
    const draft = hydrateInlineDraft(tx());
    draft.lines[0].doseTo = '';
    const normalized = normalizeInlineDraft(draft);
    assert.equal(normalized.lines[0]?.doseTo, '');
    const errors = validateInlineDraft(normalized);
    assert.equal(errors['regimenLines.0.doseTo'], 'Enter both ends of the dose range.');
    const applied = applyInlineDraft(tx(), normalized);
    assert.equal(applied.regimenLines?.[0]?.doseTo, null);
  });

  it('preserves an additional THEN dosing schedule on save', () => {
    const draft = hydrateInlineDraft(tx());
    draft.lines = [
      draft.lines[0],
      {
        ...draft.lines[0],
        clientId: 'line-2',
        sequence: 2,
        doseFrom: '1',
        frequency: 'QD - Once daily',
      },
    ];
    const next = applyInlineDraft(tx(), draft);
    assert.equal(next.regimenLines?.length, 2);
    assert.equal(next.regimenLines?.[1]?.doseFrom, '1');
    const rehydrated = hydrateInlineDraft(next);
    assert.equal(rehydrated.lines.length, 2);
    assert.equal(rehydrated.lines[1]?.doseFrom, '1');
  });

  it('saves sequential taper course length and per-schedule durations', () => {
    const draft = hydrateInlineDraft(tx({ duration: '7 days', prn: false, quantity: '14 Tablet(s)' }));
    draft.lines = [
      {
        ...draft.lines[0],
        doseFrom: '4',
        form: 'Tablet(s)',
        frequency: 'Once daily',
        prn: false,
        durationValue: '2',
        durationUnit: 'DAY',
      },
      {
        ...draft.lines[0],
        clientId: 'line-2',
        sequence: 2,
        doseFrom: '2',
        form: 'Tablet(s)',
        frequency: 'Once daily',
        prn: false,
        durationValue: '3',
        durationUnit: 'DAY',
      },
    ];
    draft.quantityValue = '14';
    const next = applyInlineDraft(tx({ prn: false }), draft);
    assert.equal(next.duration, '5 days');
    assert.equal(next.regimenLines?.[0]?.durationValue, '2');
    assert.equal(next.regimenLines?.[1]?.durationValue, '3');
    assert.equal(
      next.patientDirections,
      'Take 4 tablets by mouth once daily for 2 days, then take 2 tablets by mouth once daily for 3 days.',
    );
    const errors = validateInlineDraft(draft);
    assert.equal(errors['regimenLines.0.durationValue'], undefined);
    assert.equal(errors['regimenLines.1.durationValue'], undefined);
  });

  it('requires a duration on each sequential dosing schedule', () => {
    const draft = hydrateInlineDraft(tx());
    draft.lines = [
      { ...draft.lines[0], durationValue: '2', durationUnit: 'DAY' },
      {
        ...draft.lines[0],
        clientId: 'line-2',
        sequence: 2,
        doseFrom: '2',
        durationValue: null,
        durationUnit: 'DAY',
      },
    ];
    const errors = validateInlineDraft(draft);
    assert.equal(
      errors['regimenLines.1.durationValue'],
      'Enter how long this schedule should be taken.',
    );
  });

  it('rejects an inverted dose range', () => {
    const draft = hydrateInlineDraft(tx());
    draft.lines[0].doseTo = '0.5';
    const errors = validateInlineDraft(draft);
    assert.equal(
      errors['regimenLines.0.doseTo'],
      'Maximum dose must be equal to or greater than minimum dose.',
    );
  });

  it('applies the draft back onto the saved treatment', () => {
    const original = tx();
    const draft = hydrateInlineDraft(original);
    draft.quantityValue = '21';
    draft.lines[0].doseFrom = '1';
    const next = applyInlineDraft(original, draft);
    assert.match(next.quantity ?? '', /^21 /);
    assert.equal(next.prn, true);
    assert.equal(next.frequency, 'Q6-8H - Every 6 to 8 hours');
    assert.ok(next.patientDirections?.trim());
  });

  it('keeps ZORYVE foam as topical applications, never tablets', () => {
    const foam = tx({
      medicationName: 'Roflumilast 0.3% Foam (Zoryve)',
      genericName: 'roflumilast',
      brandName: 'ZORYVE',
      strength: '0.3%',
      dose: 'Apply a thin layer',
      doseAmount: undefined,
      doseUnit: 'Application(s)',
      productForm: 'Foam',
      frequency: 'Once daily',
      duration: '8 weeks',
      prn: false,
      route: 'Topical',
      quantity: '',
      quantityUnit: 'g',
      instructions: undefined,
      patientDirections: undefined,
    });
    const draft = hydrateInlineDraft(foam);
    assert.equal(draft.productForm, 'Foam');
    assert.equal(draft.route, 'Topical');
    assert.equal(draft.lines[0]?.form, 'Application(s)');
    assert.equal(draft.lines[0]?.doseFrom, 'Apply a thin layer');
    assert.equal(draft.quantityUnit, 'g');
    assert.equal(
      draft.patientDirections,
      'Apply a thin layer to the affected area topically once daily for 8 weeks.',
    );
    assert.doesNotMatch(draft.patientDirections, /tablet/i);
  });

  it('infers oral route and bag mapping from directions text', () => {
    const bag = tx({
      medicationName: 'Oral rehydration demo',
      dose: '2',
      doseAmount: '2',
      doseUnit: 'Bag(s)',
      frequency: 'Twice daily (bid)',
      duration: '1 day',
      route: '',
      productForm: undefined,
      quantity: '2 Bag(s)',
      quantityUnit: 'Bag(s)',
      patientDirections: 'Take 2 bags by mouth twice daily (bid) for up to 1 day.',
      directionsMode: 'MANUAL',
    });
    const draft = hydrateInlineDraft(bag);
    assert.equal(draft.route, 'Oral');
    assert.equal(draft.productForm, 'Solution');
    assert.equal(draft.lines[0]?.form, 'Bag(s)');
    assert.equal(Object.keys(validateInlineDraft(draft)).length, 0);
  });

  it('tolerates partial regimen lines from the API and refill changes', () => {
    const partial = tx({
      regimenLines: [
        {
          clientId: 'line-1',
          sequence: 1,
          doseFrom: undefined as unknown as string,
          doseTo: null,
          form: undefined as unknown as string,
          frequency: undefined as unknown as string,
          prn: false,
          durationValue: null,
          durationUnit: 'DAY',
        },
      ],
      quantity: undefined,
      quantityUnit: undefined,
    });
    const draft = hydrateInlineDraft(partial);
    assert.equal(draft.lines[0]?.doseFrom, '');
    assert.equal(draft.lines[0]?.form, 'Tablet(s)');
    assert.doesNotThrow(() => regimenFingerprint(draft));
    const withRefill = normalizeInlineDraft({ ...draft, refills: 1 });
    assert.equal(withRefill.refills, 1);
    assert.doesNotThrow(() => validateInlineDraft(withRefill));
    assert.doesNotThrow(() => isInlineDraftDirty(withRefill, draft));
  });

  it('keeps dispense quantity when only the unit is patched, and vice versa', () => {
    const draft = hydrateInlineDraft(tx());
    const unitOnly = applyInlineDraftPatch(draft, {
      quantityUnit: 'g',
      quantityValue: undefined,
      refills: undefined,
    });
    assert.equal(unitOnly.quantityValue, '28');
    assert.equal(unitOnly.quantityUnit, 'g');
    assert.equal(unitOnly.refills, 0);

    const qtyOnly = applyInlineDraftPatch(draft, {
      quantityValue: '3',
      quantityUnit: undefined,
    });
    assert.equal(qtyOnly.quantityValue, '3');
    assert.equal(qtyOnly.quantityUnit, 'Tablet(s)');
  });
});
