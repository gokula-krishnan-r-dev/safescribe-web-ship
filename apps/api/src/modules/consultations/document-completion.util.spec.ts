import { treatmentPlanHasPrescription } from './document-completion.util';

describe('treatmentPlanHasPrescription', () => {
  it('detects selectedTreatments with a prescription category', () => {
    expect(
      treatmentPlanHasPrescription({
        selectedTreatments: [
          { medicationName: 'APO-DEXAMETHASONE', category: 'PRESCRIPTION' },
        ],
      }),
    ).toBe(true);
  });

  it('treats missing category as prescription', () => {
    expect(
      treatmentPlanHasPrescription({
        selectedItemsSnapshot: [{ medicationName: 'Amoxicillin' }],
      }),
    ).toBe(true);
  });

  it('ignores OTC-only selections', () => {
    expect(
      treatmentPlanHasPrescription({
        selectedTreatments: [{ medicationName: 'Tylenol', category: 'OTC' }],
      }),
    ).toBe(false);
  });

  it('uses selectedIndexes into recommendedTreatments', () => {
    expect(
      treatmentPlanHasPrescription({
        recommendedTreatments: [
          { medicationName: 'Tylenol', category: 'OTC' },
          { medicationName: 'Amoxicillin', category: 'PRESCRIPTION' },
        ],
        selectedIndexes: [1],
      }),
    ).toBe(true);
  });
});
