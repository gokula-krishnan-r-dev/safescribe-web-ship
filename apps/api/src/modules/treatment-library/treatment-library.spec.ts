import {
  buildTreatmentLibrarySearchText,
  canSelectLibraryResult,
  formatLibraryResultTitle,
  isPersistedPathwayTreatment,
  libraryOwnedOverrides,
  mergePathwayOwnedFields,
  resolvePathwayLibraryUsage,
  sanitizeTreatmentLibrarySearch,
  treatmentLibraryTabWhere,
} from '@safescript/shared';

describe('treatment library helpers', () => {
  it('sanitizes and bounds search terms', () => {
    expect(sanitizeTreatmentLibrarySearch('  ibu%profen_*  ')).toBe('ibu profen');
    expect(sanitizeTreatmentLibrarySearch('a'.repeat(200)).length).toBe(120);
  });

  it('builds a lowercase searchable blob', () => {
    expect(
      buildTreatmentLibrarySearchText({
        displayName: 'IBUPROFEN',
        genericName: 'ibuprofen',
        strength: '100 mg/5 mL',
        productFormDisplay: 'Suspension',
        routeDisplay: 'Oral',
        regimenLabel: 'Pediatric weight-based',
      }),
    ).toContain('ibuprofen');
  });

  it('maps list tabs to status filters', () => {
    expect(treatmentLibraryTabWhere('approved')).toEqual({ listStatus: 'APPROVED' });
    expect(treatmentLibraryTabWhere('drafts')).toEqual({ listStatus: 'DRAFT' });
    expect(treatmentLibraryTabWhere('needs_review')).toEqual({
      listStatus: { in: ['IN_REVIEW', 'CHANGES_REQUESTED'] },
    });
    expect(treatmentLibraryTabWhere('all')).toEqual({});
  });

  it('detects exact, older, and similar pathway usage', () => {
    const item = {
      id: 'lib-1',
      approvedVersionNumber: 3,
      genericName: 'ibuprofen',
      productFormDisplay: 'Tablet',
      routeDisplay: 'Oral',
    };
    expect(resolvePathwayLibraryUsage(item, [])).toEqual({ state: 'not_used' });
    expect(
      resolvePathwayLibraryUsage(item, [
        { id: 't1', treatmentLibraryItemId: 'lib-1', sourceVersionNumber: 3 },
      ]),
    ).toEqual({ state: 'exact_version', pathwayTreatmentId: 't1' });
    expect(
      resolvePathwayLibraryUsage(item, [
        { id: 't2', treatmentLibraryItemId: 'lib-1', sourceVersionNumber: 1 },
      ]),
    ).toEqual({
      state: 'older_version',
      pathwayTreatmentId: 't2',
      currentVersionNumber: 1,
    });
    expect(
      resolvePathwayLibraryUsage(item, [
        {
          id: 't3',
          genericName: 'ibuprofen',
          productForm: 'Tablet',
          route: 'Oral',
        },
      ]),
    ).toEqual({
      state: 'similar_treatment',
      pathwayTreatmentId: 't3',
      reasonCode: 'same_ingredient_form_route',
    });
    expect(
      resolvePathwayLibraryUsage(item, [
        {
          id: 't4',
          treatmentLibraryItemId: 'lib-other',
          genericName: 'ibuprofen',
          productForm: 'Tablet',
          route: 'Oral',
        },
      ]),
    ).toEqual({
      state: 'similar_treatment',
      pathwayTreatmentId: 't4',
      reasonCode: 'same_ingredient_form_route',
    });
  });

  it('blocks duplicate and unmatched medication selection', () => {
    expect(
      canSelectLibraryResult({
        usageState: 'not_used',
        category: 'PRESCRIPTION',
        matchStatus: 'MATCHED',
      }),
    ).toBe(true);
    expect(
      canSelectLibraryResult({
        usageState: 'exact_version',
        category: 'PRESCRIPTION',
        matchStatus: 'MATCHED',
      }),
    ).toBe(false);
    expect(
      canSelectLibraryResult({
        usageState: 'not_used',
        category: 'PRESCRIPTION',
        matchStatus: 'INCOMPLETE',
      }),
    ).toBe(false);
    expect(
      canSelectLibraryResult({
        usageState: 'similar_treatment',
        category: 'OTC',
        matchStatus: 'MATCHED',
      }),
    ).toBe(true);
  });

  it('formats titles without duplicating strength and keeps pathway-owned fields', () => {
    expect(formatLibraryResultTitle('Ibuprofen 200 mg tablet', '200 mg')).toBe(
      'Ibuprofen 200 mg tablet',
    );
    expect(formatLibraryResultTitle('Ibuprofen tablet', '200 mg')).toBe('Ibuprofen tablet 200 mg');
    expect(isPersistedPathwayTreatment('')).toBe(false);
    expect(isPersistedPathwayTreatment('tx-1')).toBe(true);
    expect(
      mergePathwayOwnedFields(
        { medicationName: 'Ibuprofen', recommendationLevel: 'FIRST_LINE', displayOrder: 1 },
        { recommendationLevel: 'ALTERNATIVE', provinceAvailability: 'AB' },
      ),
    ).toEqual({
      medicationName: 'Ibuprofen',
      recommendationLevel: 'ALTERNATIVE',
      displayOrder: 1,
      provinceAvailability: 'AB',
    });
    expect(
      libraryOwnedOverrides(
        { duration: '5 days', directions: 'Take with food', routeDisplay: 'Oral' },
        { duration: '3 days', directions: 'Take with food', route: 'Oral' },
      ),
    ).toEqual({ duration: '3 days' });
  });
});
