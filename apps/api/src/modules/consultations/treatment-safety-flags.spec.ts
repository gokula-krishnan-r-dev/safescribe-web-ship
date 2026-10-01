import { mapSafetyEvalToMedication } from './treatment-safety-flags';
import {
  isValueSetOrSelectorCode,
  isVisibleSafetyReviewItem,
  presentationKindForFinding,
  type SafetyFinding,
} from '@safescript/shared';

function finding(
  partial: Partial<SafetyFinding> & Pick<SafetyFinding, 'findingType' | 'detail'>,
): SafetyFinding {
  return {
    summary: partial.summary ?? partial.detail,
    clinicalSeverity: 'HIGH',
    recommendedAction: 'Review',
    overrideAllowed: true,
    overrideReasonRequired: false,
    ...partial,
  };
}

describe('mapSafetyEvalToMedication', () => {
  it('attaches a direct allergy finding to a pharmacist-added oseltamivir candidate', () => {
    const allergyFinding: SafetyFinding = {
      findingType: 'allergy',
      matchType: 'exact_ingredient',
      summary: 'Allergy to oseltamivir',
      detail: 'Patient has a recorded allergy to oseltamivir.',
      clinicalSeverity: 'CRITICAL',
      recommendedAction: 'Do not prescribe',
      implicatedProductName: 'oseltamivir (oseltamivir phosphate)',
      overrideAllowed: true,
      overrideReasonRequired: true,
    };
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'oseltamivir (oseltamivir phosphate)',
      genericName: 'oseltamivir phosphate',
      findings: [allergyFinding],
      patientAllergies: ['oseltamivir'],
    });
    expect(mapped.allergyBlocked).toBe(true);
    expect(mapped.status).toBe('AVOID');
    expect(mapped.safetyTier).toBe('AVOID');
    expect(mapped.allergyWarning?.reason).toContain('allergy to oseltamivir');
  });

  it('falls back to ingredient matching when engine findings are empty', () => {
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'oseltamivir phosphate',
      findings: [],
      patientAllergies: ['oseltamivir'],
    });
    expect(mapped.allergyBlocked).toBe(true);
    expect(mapped.status).toBe('AVOID');
  });

  it('does not emit an allergy when the patient has none, even if the engine sent one (MX-12)', () => {
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'MAXALT (rizatriptan 10 mg)',
      genericName: 'rizatriptan',
      findings: [
        finding({
          findingType: 'allergy',
          matchType: 'exact_ingredient',
          clinicalSeverity: 'CRITICAL',
          detail: 'Ondansetron has matched pregnancy.',
          implicatedProductName: 'MAXALT (rizatriptan 10 mg)',
        }),
      ],
      patientAllergies: [],
    });
    expect(mapped.allergyBlocked).toBe(false);
    expect(mapped.allergyWarning).toBeUndefined();
    expect(mapped.safetyReviewItems.some((i) => i.safetyDomain === 'allergy')).toBe(false);
    expect(mapped.safetyTier).toBe('PREFERRED');
  });

  it('does not attach an unrelated patient allergen as the allergy label', () => {
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'MAXALT (rizatriptan 10 mg)',
      genericName: 'rizatriptan',
      findings: [
        finding({
          findingType: 'allergy',
          clinicalSeverity: 'CRITICAL',
          detail: 'Allergy match',
          implicatedProductName: 'MAXALT (rizatriptan 10 mg)',
        }),
      ],
      patientAllergies: ['penicillin'],
    });
    expect(mapped.allergyWarning).toBeUndefined();
    expect(mapped.allergyBlocked).toBe(false);
    expect(mapped.safetyTier).not.toBe('AVOID');
  });

  it('keeps an ondansetron pregnancy finding on ondansetron, never as Allergy (MX-02)', () => {
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'Ondansetron 8 mg',
      genericName: 'ondansetron',
      findings: [
        finding({
          findingType: 'pregnancy',
          matchType: 'pregnancy_caution',
          clinicalSeverity: 'HIGH',
          detail:
            'Ondansetron has matched pregnancy. Health Canada notes that use during pregnancy is not recommended.',
          implicatedProductName: 'Ondansetron 8 mg',
          ruleCode: 'SS-PREG-ONDANSETRON-PREGNANCY-NOT-RECOMMENDED-WITHOUT-REVIEW',
        }),
        finding({
          findingType: 'pregnancy',
          matchType: 'pregnancy_caution',
          clinicalSeverity: 'MODERATE',
          detail: 'rizatriptan has matched a confirmed pregnancy. Review maternal indication.',
          implicatedProductName: 'MAXALT (rizatriptan 10 mg)',
          ruleCode: 'SS-PREG-RIZATRIPTAN-TRIPTAN-PREGNANCY-REVIEW',
        }),
      ],
      patientAllergies: [],
    });
    expect(mapped.allergyBlocked).toBe(false);
    expect(mapped.pregnancyWarning?.message).toMatch(/ondansetron/i);
    expect(mapped.pregnancyWarning?.message).not.toMatch(/rizatriptan/i);
    const visible = mapped.safetyReviewItems.filter(isVisibleSafetyReviewItem);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.safetyDomain).toBe('pregnancy');
    expect(visible[0]?.title).not.toMatch(/allergy/i);
  });

  it('does not badge acetaminophen as Avoid from a leaked NSAID pregnancy finding', () => {
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'PRESCRIPTION ACETAMINOPHEN',
      genericName: 'acetaminophen',
      findings: [
        finding({
          findingType: 'pregnancy',
          matchType: 'pregnancy_contraindicated',
          clinicalSeverity: 'HIGH',
          detail:
            'A systemic NSAID has matched pregnancy from 20 weeks to below 28 weeks.',
          implicatedProductName: 'PRESCRIPTION ACETAMINOPHEN',
          ruleCode: 'SS-PREG-SYSTEMIC-NSAID-GA20-27',
          ruleDomain: 'PREGNANCY',
        }),
      ],
      patientAllergies: [],
    });
    expect(mapped.safetyReviewItems).toHaveLength(0);
    expect(mapped.allergyBlocked).toBe(false);
    expect(mapped.safetyTier).toBe('PREFERRED');
  });

  it('does not treat a HIGH pregnancy finding as allergy (MX-01 / WR-01)', () => {
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'MAXALT (rizatriptan 10 mg)',
      genericName: 'rizatriptan',
      findings: [
        finding({
          findingType: 'pregnancy',
          matchType: 'pregnancy_caution',
          clinicalSeverity: 'HIGH',
          detail:
            'Ondansetron has matched pregnancy. Health Canada notes that use during pregnancy is not recommended.',
          implicatedProductName: 'Ondansetron 8 mg',
          ruleCode: 'SS-PREG-ONDANSETRON-PREGNANCY-NOT-RECOMMENDED-WITHOUT-REVIEW',
        }),
        finding({
          findingType: 'pregnancy',
          matchType: 'pregnancy_caution',
          clinicalSeverity: 'MODERATE',
          detail: 'rizatriptan has matched a confirmed pregnancy. Review maternal indication.',
          implicatedProductName: 'MAXALT (rizatriptan 10 mg)',
          ruleCode: 'SS-PREG-RIZATRIPTAN-TRIPTAN-PREGNANCY-REVIEW',
        }),
      ],
      patientAllergies: [],
    });

    expect(mapped.allergyBlocked).toBe(false);
    expect(mapped.allergyWarning).toBeUndefined();
    expect(mapped.pregnancyWarning?.active).toBe(true);
    expect(mapped.pregnancyWarning?.message).toMatch(/rizatriptan/i);
    expect(mapped.pregnancyWarning?.message).not.toMatch(/ondansetron/i);
    expect(mapped.safetyTier).toBe('CAUTION');
    const visible = mapped.safetyReviewItems.filter(isVisibleSafetyReviewItem);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.safetyDomain).toBe('pregnancy');
    expect(visible[0]?.title).not.toMatch(/allergy/i);
  });

  it('does not surface unmatched renal/hepatic/interaction monograph as review items (WR-02)', () => {
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'MAXALT (rizatriptan 10 mg)',
      genericName: 'rizatriptan',
      findings: [],
      patientAllergies: [],
    });
    expect(mapped.renalWarning).toBeUndefined();
    expect(mapped.hepaticWarning).toBeUndefined();
    expect(mapped.interactions).toEqual([]);
    expect(mapped.safetyReviewItems.filter(isVisibleSafetyReviewItem)).toEqual([]);
    expect(mapped.safetyTier).toBe('PREFERRED');
    expect(mapped.status).toBe('CLEAR');
  });

  it('keeps a matched avoid interaction as a significant risk', () => {
    const mapped = mapSafetyEvalToMedication({
      medicationName: 'MAXALT (rizatriptan 10 mg)',
      genericName: 'rizatriptan',
      findings: [
        finding({
          findingType: 'drug_interaction',
          matchType: 'ddi_major',
          clinicalSeverity: 'HIGH',
          detail: 'contraindicated with MAO inhibitors',
          recommendedAction: 'Avoid combination',
          implicatedProductName: 'MAXALT (rizatriptan 10 mg)',
        }),
      ],
      patientAllergies: [],
    });
    expect(mapped.safetyTier).toBe('AVOID');
    expect(mapped.interactions).toHaveLength(1);
    expect(mapped.safetyReviewItems.filter(isVisibleSafetyReviewItem)[0]?.presentationKind).toBe(
      'SIGNIFICANT_RISK',
    );
  });
});

describe('presentationKindForFinding', () => {
  it('classifies monitor DDI copy as reference, not a review obligation', () => {
    expect(
      presentationKindForFinding({
        findingType: 'drug_interaction',
        clinicalSeverity: 'MODERATE',
        detail: 'monitor for serotonin syndrome with SSRIs or SNRIs',
        recommendedAction: 'Monitor',
      }),
    ).toBe('REFERENCE');
  });

  it('classifies contraindicated pregnancy as significant risk', () => {
    expect(
      presentationKindForFinding({
        findingType: 'pregnancy',
        clinicalSeverity: 'HIGH',
        matchType: 'pregnancy_contraindicated',
        detail: 'contraindicated in pregnancy',
      }),
    ).toBe('SIGNIFICANT_RISK');
  });
});

describe('isValueSetOrSelectorCode', () => {
  it('accepts selector codes and rejects ingredient names', () => {
    expect(isValueSetOrSelectorCode('SEL-ONDANSETRON')).toBe(true);
    expect(isValueSetOrSelectorCode('VS-SYSTEMIC-NSAIDS')).toBe(true);
    expect(isValueSetOrSelectorCode('Ondansetron')).toBe(false);
    expect(isValueSetOrSelectorCode('rizatriptan')).toBe(false);
    expect(isValueSetOrSelectorCode('Systemic NSAIDs')).toBe(false);
    expect(isValueSetOrSelectorCode('NSAID')).toBe(false);
  });
});

describe('Zomig / zolmitriptan safety mapping', () => {
  const zomigProducts = [
    { medicationName: 'ZOMIG', genericName: 'zolmitriptan' },
    { medicationName: 'ZOMIG RAPIMELT', genericName: 'zolmitriptan' },
    { medicationName: 'ZOMIG NASAL SPRAY', genericName: 'zolmitriptan' },
  ];

  it('does not badge Zomig nasal Avoid from an Imitrex nasal allergy finding', () => {
    const imitrexNasalAllergy = finding({
      findingType: 'allergy',
      matchType: 'exact_ingredient',
      clinicalSeverity: 'HIGH',
      summary: 'Recorded sumatriptan allergy',
      detail: 'Patient has a recorded allergy to sumatriptan.',
      implicatedProductName: 'IMITREX NASAL SPRAY',
    });

    for (const product of zomigProducts) {
      const mapped = mapSafetyEvalToMedication({
        ...product,
        findings: [imitrexNasalAllergy],
        patientAllergies: ['sumatriptan'],
      });
      expect(mapped.allergyBlocked).toBe(false);
      expect(mapped.safetyTier).not.toBe('AVOID');
    }
  });

  it('gives oral, Rapimelt, and nasal Zomig the same ingredient-level status', () => {
    const zolmitriptanCaution = finding({
      findingType: 'pregnancy',
      matchType: 'pregnancy_caution',
      clinicalSeverity: 'MODERATE',
      summary: 'Triptan pregnancy review',
      detail: 'zolmitriptan has matched a confirmed pregnancy. Review maternal indication.',
      ruleCode: 'SS-PREG-ZOLMITRIPTAN-TRIPTAN-PREGNANCY-REVIEW',
      implicatedProductName: 'ZOMIG',
    });

    const tiers = zomigProducts.map(
      (product) =>
        mapSafetyEvalToMedication({
          ...product,
          findings: [zolmitriptanCaution],
          patientAllergies: ['sumatriptan'],
        }).safetyTier,
    );

    expect(new Set(tiers).size).toBe(1);
    expect(tiers[0]).toBe('CAUTION');
  });
});
