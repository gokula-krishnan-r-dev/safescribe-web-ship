import {
  baseIngredientKeys,
  classifyTreatmentDuplicate,
  dropPharmacistAddedDuplicates,
  identityFromTreatmentRecord,
  remapSelectedIndexes,
  routeFamily,
  type MedicationIdentityInput,
} from '@safescript/shared';

function med(patch: Partial<MedicationIdentityInput> = {}): MedicationIdentityInput {
  return {
    medicationName: 'oseltamivir phosphate',
    route: 'Oral',
    ...patch,
  };
}

describe('treatment duplicate identity', () => {
  it('maps oseltamivir salt and synonym labels to the same base ingredient', () => {
    const a = baseIngredientKeys('oseltamivir');
    const b = baseIngredientKeys('oseltamivir phosphate');
    const c = baseIngredientKeys('oseltamivir (oseltamivir phosphate)');
    expect(a).toEqual(['oseltamivir']);
    expect(b).toEqual(['oseltamivir']);
    expect(c).toEqual(['oseltamivir']);
  });

  it('ignores capitalization and brand/generic pairing for identity', () => {
    expect(baseIngredientKeys('OSELTAMIVIR Phosphate')).toEqual(
      baseIngredientKeys('oseltamivir', 'Oseltamivir phosphate'),
    );
  });

  it('classifies oral vs topical as different route families', () => {
    expect(routeFamily('Oral')).toBe('oral');
    expect(routeFamily('by mouth')).toBe('oral');
    expect(routeFamily('Topical cream')).toBe('topical');
  });
});

describe('classifyTreatmentDuplicate', () => {
  it('returns EXACT_PATHWAY_OPTION for an oseltamivir synonym in the guided catalog', () => {
    const result = classifyTreatmentDuplicate(
      med({
        medicationName: 'oseltamivir (oseltamivir phosphate)',
        genericName: 'oseltamivir phosphate',
        drugId: 'ccdd-oseltamivir-search',
        source: 'ccdd',
      }),
      {
        pathwayOptions: [
          med({
            medicationName: 'oseltamivir phosphate',
            pathwayTreatmentId: 'pathway_option_oseltamivir',
            source: 'pathway',
            allergyBlocked: true,
            allergyWarningReason: 'Patient has a recorded allergy to oseltamivir.',
          }),
        ],
        planTreatments: [],
      },
    );
    expect(result.matchType).toBe('EXACT_PATHWAY_OPTION');
    expect(result.blocking).toBe(true);
    expect(result.existingPathwayOptionId).toBe('pathway_option_oseltamivir');
    expect(result.existingSafetyStatus).toBe('AVOID');
    expect(result.existingBlockingFindingSummary).toContain('allergy to oseltamivir');
  });

  it('blocks same base ingredient and route even without a shared drugId', () => {
    const result = classifyTreatmentDuplicate(
      med({ medicationName: 'oseltamivir', route: 'PO' }),
      {
        pathwayOptions: [med({ pathwayTreatmentId: 'opt-1', source: 'pathway' })],
        planTreatments: [],
      },
    );
    expect(result.blocking).toBe(true);
    expect(['EXACT_PATHWAY_OPTION', 'SAME_INGREDIENT_SAME_ROUTE']).toContain(
      result.matchType,
    );
  });

  it('returns EXACT_SELECTED_TREATMENT for a pharmacist-added copy already in the plan', () => {
    const result = classifyTreatmentDuplicate(
      med({ medicationName: 'acetaminophen', drugId: 'apap-1', route: 'Oral' }),
      {
        pathwayOptions: [],
        planTreatments: [
          med({
            medicationName: 'acetaminophen',
            drugId: 'apap-1',
            route: 'Oral',
            treatmentInstanceId: 'draft_apap',
            source: 'ccdd',
          }),
        ],
      },
    );
    expect(result.matchType).toBe('EXACT_SELECTED_TREATMENT');
    expect(result.blocking).toBe(true);
    expect(result.existingTreatmentInstanceId).toBe('draft_apap');
  });

  it('warns for the same ingredient with a different route instead of blocking', () => {
    const result = classifyTreatmentDuplicate(
      med({ medicationName: 'diclofenac', route: 'Oral' }),
      {
        pathwayOptions: [
          med({
            medicationName: 'diclofenac',
            route: 'Topical',
            pathwayTreatmentId: 'opt-diclo-topical',
            source: 'pathway',
          }),
        ],
        planTreatments: [],
      },
    );
    expect(result.matchType).toBe('RELATED_INGREDIENT_DIFFERENT_ROUTE');
    expect(result.blocking).toBe(false);
  });

  it('does not treat unrelated drugs in the same class as duplicates', () => {
    const result = classifyTreatmentDuplicate(
      med({ medicationName: 'ibuprofen', route: 'Oral' }),
      {
        pathwayOptions: [
          med({
            medicationName: 'naproxen',
            route: 'Oral',
            pathwayTreatmentId: 'opt-nsaid',
            source: 'pathway',
          }),
        ],
        planTreatments: [],
      },
    );
    expect(result.matchType).toBe('NONE');
    expect(result.blocking).toBe(false);
  });

  it('ignores devices and custom compounds', () => {
    const result = classifyTreatmentDuplicate(
      {
        medicationName: 'AeroChamber',
        treatmentKind: 'DEVICE',
        source: 'manual',
      },
      {
        pathwayOptions: [],
        planTreatments: [
          { medicationName: 'AeroChamber', treatmentKind: 'DEVICE', source: 'manual' },
        ],
      },
    );
    expect(result.matchType).toBe('NONE');
  });
});

describe('dropPharmacistAddedDuplicates', () => {
  it('keeps the guided Avoid option and drops the pharmacist-added oseltamivir copy', () => {
    const { kept, dropped, indexMap } = dropPharmacistAddedDuplicates([
      {
        medicationName: 'oseltamivir phosphate',
        route: 'Oral',
        pathwayTreatmentId: 'pathway_option_oseltamivir',
        source: 'pathway',
        allergyBlocked: true,
      },
      {
        medicationName: 'oseltamivir (oseltamivir phosphate)',
        genericName: 'oseltamivir phosphate',
        route: 'Oral',
        source: 'ccdd',
        treatmentInstanceId: 'manual-copy',
      },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].pathwayTreatmentId).toBe('pathway_option_oseltamivir');
    expect(dropped).toHaveLength(1);
    expect(indexMap).toEqual([0, -1]);
    expect(remapSelectedIndexes([1], indexMap)).toEqual([]);
    expect(remapSelectedIndexes([0], indexMap)).toEqual([0]);
  });

  it('round-trips identityFromTreatmentRecord for allergy summaries', () => {
    const identity = identityFromTreatmentRecord({
      medicationName: 'oseltamivir phosphate',
      pathwayTreatmentId: 'opt',
      allergyBlocked: true,
      allergyWarning: { reason: 'Patient has a recorded allergy to oseltamivir.' },
    });
    expect(identity.allergyBlocked).toBe(true);
    expect(identity.allergyWarningReason).toContain('allergy');
  });
});
