import {
  CLINICAL_REFERENCE_UI,
  formatClinicalReferences,
  formatClinicalReferenceConsultedDate,
  hasValidClinicalReferences,
  isValidClinicalReferenceSelection,
  preferClinicalReferences,
  stripClinicalReferencesProse,
  validClinicalReferenceSelections,
  type ClinicalReferenceSelection,
} from '@safescript/shared';

const consultedOn = '2026-08-16';

function ref(
  id: ClinicalReferenceSelection['referenceId'],
  detail?: string,
): ClinicalReferenceSelection {
  return {
    referenceId: id,
    displayLabel: id,
    customDetail: detail,
    selectedAt: '2026-08-16T12:00:00.000Z',
    selectedByUserId: 'user-1',
  };
}

describe('clinical references DAP sentence', () => {
  it('formats one resource with the consultation date', () => {
    expect(formatClinicalReferences([ref('cps')], consultedOn)).toBe(
      'Clinical resource consulted: CPS / eCPS (16-Aug-2026).',
    );
  });

  it('joins two resources with and', () => {
    expect(formatClinicalReferences([ref('cps'), ref('rxfiles')], consultedOn)).toBe(
      'Clinical resources consulted: CPS / eCPS and RxFiles (16-Aug-2026).',
    );
  });

  it('uses commas and and for three or more', () => {
    expect(
      formatClinicalReferences(
        [ref('cps'), ref('rxfiles'), ref('bugs_and_drugs')],
        consultedOn,
      ),
    ).toBe(
      'Clinical resources consulted: CPS / eCPS, RxFiles, and Bugs & Drugs (16-Aug-2026).',
    );
  });

  it('includes custom detail in parentheses', () => {
    expect(
      formatClinicalReferences([ref('cps'), ref('other', 'DynaMed')], consultedOn),
    ).toBe(
      'Clinical resources consulted: CPS / eCPS and Other (DynaMed) (16-Aug-2026).',
    );
  });

  it('omits Other without detail', () => {
    expect(isValidClinicalReferenceSelection(ref('other'))).toBe(false);
    expect(formatClinicalReferences([ref('other')], consultedOn)).toBeNull();
  });

  it('keeps a pharmacist selection when the overlapping write is empty', () => {
    const selected = {
      selections: [ref('medsask')],
      consultedOn,
    };
    const empty = { selections: [] as ClinicalReferenceSelection[], consultedOn };
    expect(preferClinicalReferences(empty, selected)).toEqual(selected);
    expect(preferClinicalReferences(selected, empty)).toEqual(selected);
    expect(preferClinicalReferences(undefined, selected)).toEqual(selected);
    expect(preferClinicalReferences(undefined, undefined)).toBeUndefined();
  });

  it('formats consultedOn as DD-MMM-YYYY', () => {
    expect(formatClinicalReferenceConsultedDate('2026-08-16')).toBe('16-Aug-2026');
  });

  it('replaces rather than appends an existing references sentence', () => {
    const plan =
      'Counselling provided.\n\nClinical resources consulted: RxFiles. Consulted 11-Aug-2026.\n';
    const cleaned = stripClinicalReferencesProse(plan);
    expect(cleaned).toBe('Counselling provided.');
    expect(cleaned).not.toMatch(/Clinical resources consulted/);
  });

  it('strips a references sentence that is not on its own line', () => {
    const plan =
      'Counselling provided. Clinical resources consulted: RxFiles. Consulted 11-Aug-2026.';
    expect(stripClinicalReferencesProse(plan)).toBe('Counselling provided.');
  });

  it('strips the parenthetical-date wording from existing notes', () => {
    const plan =
      'Counselling provided. Clinical resource consulted: CPS / eCPS (18-Aug-2026).';
    expect(stripClinicalReferencesProse(plan)).toBe('Counselling provided.');
    expect(
      stripClinicalReferencesProse(
        'Counselling provided. Clinical resources consulted: CPS / eCPS and RxFiles (18-Aug-2026).',
      ),
    ).toBe('Counselling provided.');
  });

  it('preserves selection order and drops duplicate labels', () => {
    const labels = validClinicalReferenceSelections([
      ref('rxfiles'),
      ref('cps'),
      ref('rxfiles'),
    ]);
    expect(labels.map((r) => r.referenceId)).toEqual(['rxfiles', 'cps']);
  });
});

describe('clinical reference copy', () => {
  it('uses the approved validation message', () => {
    expect(CLINICAL_REFERENCE_UI.validation).toBe(
      'Select at least one clinical resource before finalizing the consultation note.',
    );
  });
});
