import { UnprocessableEntityException } from '@nestjs/common';
import { VALACYCLOVIR_COLD_SORE_RENAL_RULES } from '@safescript/shared';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import type { DrugSearchResult } from '@/modules/terminology/drug-search.types';
import type { TerminologyService } from '@/modules/terminology/terminology.service';
import { AdjustedRegimenProductService } from './adjusted-regimen-product.service';
import type { ConsultationsService } from './consultations.service';

jest.mock('./consultations.service', () => ({
  ConsultationsService: class ConsultationsService {},
}));

jest.mock('@/modules/terminology/terminology.service', () => ({
  TerminologyService: class TerminologyService {},
}));

const user = {
  id: 'user-1',
  email: 'rph@example.com',
  role: 'PHARMACIST',
  tenantId: 'tenant-1',
  permissions: [],
  superAdminScope: null,
} as RequestUser;

function product(patch: Partial<DrugSearchResult> & Pick<DrugSearchResult, 'id' | 'label'>): DrugSearchResult {
  return {
    brandName: patch.brandName ?? patch.label,
    genericName: 'valacyclovir',
    strength: '500 mg',
    dosageForm: 'Tablet',
    source: 'ccdd',
    ...patch,
  };
}

describe('AdjustedRegimenProductService', () => {
  const treatment = {
    pathwayTreatmentId: 'tx-valacyclovir',
    medicationName: 'VALTREX',
    genericName: 'valacyclovir',
    brandName: 'VALTREX',
    displayName: 'VALTREX',
    strength: '1 g',
    productForm: 'Tablet',
    route: 'Oral',
    patientDirections: 'Take 1 g by mouth at the first sign of symptoms.',
    renalAdjustmentRequired: true,
    renalDosingBasis: 'eGFR',
    renalDosingRules: VALACYCLOVIR_COLD_SORE_RENAL_RULES,
  };

  const consultation = {
    id: 'c1',
    treatmentPlan: { selectedTreatments: [treatment] },
    demographics: { labValues: 'eGFR 21 mL/min' },
  };

  function service(matches: DrugSearchResult[]) {
    const consultations = {
      findOne: jest.fn().mockResolvedValue(consultation),
    } as unknown as ConsultationsService;
    const terminology = {
      searchDrugsStrict: jest.fn().mockResolvedValue(matches),
    } as unknown as TerminologyService;
    return {
      svc: new AdjustedRegimenProductService(consultations, terminology),
      terminology,
    };
  }

  it('returns only 500 mg candidates and prefers the generic', async () => {
    const { svc, terminology } = service([
      product({ id: 'valtrex-1g', brandName: 'VALTREX', strength: '1 g', label: 'VALTREX 1 g tablet' }),
      product({ id: 'generic-500', brandName: 'valacyclovir', label: 'Valacyclovir 500 mg tablet' }),
      product({ id: 'valtrex-500', brandName: 'VALTREX', label: 'VALTREX 500 mg tablet' }),
    ]);

    const result = await svc.getCandidates('c1', user, {
      treatmentKey: 'tx-valacyclovir',
      query: null,
    });

    expect(terminology.searchDrugsStrict).toHaveBeenCalledWith(
      'valacyclovir 500 mg tablet',
      24,
      'medication',
    );
    expect(result.generatedSearchText).toBe('valacyclovir 500 mg tablet');
    expect(result.candidates.map((row) => row.productId)).toEqual(['generic-500', 'valtrex-500']);
    expect(result.preferredCandidateId).toBe('generic-500');
    expect(result.adjustedRegimenDisplay.primary).toMatch(/500 mg/);
    expect(result.adjustedRegimenDisplay.supporting).toMatch(/eGFR 21/);
    expect(result.currentProductDisplay).toMatch(/1 g/i);
  });

  it('rejects a stale recommendation fingerprint', async () => {
    const { svc } = service([
      product({ id: 'generic-500', brandName: 'valacyclovir', label: 'Valacyclovir 500 mg tablet' }),
    ]);
    await expect(
      svc.getCandidates('c1', user, {
        treatmentKey: 'tx-valacyclovir',
        recommendationId: 'renal:other:0-0:0mg',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
