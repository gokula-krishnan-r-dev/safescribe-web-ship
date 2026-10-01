import { MedicationSafetyEvaluatorService } from './medication-safety-evaluator.service';
import { MedicationSafetyCacheService } from './medication-safety-cache.service';
import { mapSafetyEvalToMedication } from '@/modules/consultations/treatment-safety-flags';
import { overlayTreatmentSafety } from '@safescript/shared';
import {
  CachedIngredientEntry,
  CachedReleaseMeta,
  CachedSafetyRule,
  CachedValueSet,
} from './medication-safety.types';
import { buildClassIndex } from './utils/class-index.util';

function nsaidValueSets(): CachedValueSet[] {
  return [
    {
      valueSetCode: 'VS-SS-NSAIDS',
      valueSetVersion: '1.0-draft',
      displayName: 'Systemic NSAIDs',
      members: [
        {
          membershipAction: 'INCLUDE',
          memberLocalCode: 'ING-IBUPROFEN',
          memberDisplayName: 'Ibuprofen',
          memberRowId: 'CVSM-IBU',
        },
        {
          membershipAction: 'INCLUDE',
          memberLocalCode: 'ING-NAPROXEN',
          memberDisplayName: 'Naproxen',
          memberRowId: 'CVSM-NAP',
        },
        {
          membershipAction: 'INCLUDE',
          memberLocalCode: 'ING-DICLOFENAC',
          memberDisplayName: 'Diclofenac',
          memberRowId: 'CVSM-DIC',
        },
      ],
    },
    {
      valueSetCode: 'VS-SYSTEMIC-NSAIDS',
      valueSetVersion: '1.0',
      displayName: 'Systemic NSAIDs',
      routeScope: 'SYSTEMIC',
      members: [
        {
          membershipAction: 'INCLUDE',
          memberLocalCode: 'ING-IBUPROFEN',
          memberDisplayName: 'Ibuprofen',
          memberRowId: 'SYS-IBU',
        },
        {
          membershipAction: 'EXCLUDE',
          memberLocalCode: 'ING-ACETAMINOPHEN',
          memberDisplayName: 'Acetaminophen',
          memberRowId: 'CVSM-ROW-0005',
        },
      ],
    },
  ];
}

function pregnancyRule(
  code: string,
  detail: string,
  ga: {
    min?: number | null;
    minInc?: boolean;
    max?: number | null;
    maxInc?: boolean;
  },
): CachedSafetyRule {
  return {
    ruleId: code,
    versionId: `${code}-v1`,
    code,
    ruleType: 'PREGNANCY',
    jurisdiction: 'ALL',
    summary: 'A systemic NSAID has matched pregnancy',
    detail,
    clinicalSeverity: 'HIGH',
    recommendedAction: 'HARD_STOP',
    overrideAllowed: false,
    overrideReasonRequired: true,
    ruleVersionLabel: '1.0-draft',
    pregnancyDetail: {
      drugName: 'Systemic NSAIDs',
      pregnancyCategory: 'CONTRAINDICATED',
      trimester: 'all',
      actionRequired: 'HARD_STOP',
      gestationalAgeMinWeeks: ga.min ?? null,
      gestationalAgeMinInclusive: ga.minInc,
      gestationalAgeMaxWeeks: ga.max ?? null,
      gestationalAgeMaxInclusive: ga.maxInc,
    },
    participants: [
      {
        participantKey: 'drug',
        selectorType: 'VALUE_SET',
        conceptText: 'Systemic NSAIDs',
        conceptCode: 'VS-SS-NSAIDS',
        selectorVersion: '1.0-draft',
      },
    ],
  };
}

const NSAID_PREGNANCY_RULES: CachedSafetyRule[] = [
  pregnancyRule(
    'SS-PREG-SYSTEMIC-NSAID-GA20-27',
    'A systemic NSAID has matched pregnancy from 20 weeks to below 28 weeks. Avoid unless specifically recommended.',
    { min: 20, minInc: true, max: 28, maxInc: false },
  ),
  pregnancyRule(
    'SS-PREG-SYSTEMIC-NSAID-GA28-PLUS',
    'A systemic NSAID has matched pregnancy at 28 weeks or later. Avoid unless specifically recommended.',
    { min: 28, minInc: true, max: null, maxInc: true },
  ),
];

function mockCache(opts: {
  rules?: CachedSafetyRule[];
  valueSets?: CachedValueSet[];
  ingredients?: Record<string, CachedIngredientEntry>;
}) {
  const classIndex = buildClassIndex({
    taxonomyRows: [],
    catalogRows: [],
    membershipRows: [],
  });
  const meta: CachedReleaseMeta = {
    releaseId: 'rel-nsaid',
    version: 'KR-NSAID-TEST',
    checksum: 'abc',
    engineVersion: 'safety-engine-2.0.0',
    ruleCount: opts.rules?.length ?? 0,
    ingredientCount: Object.keys(opts.ingredients ?? {}).length,
    classMemberCount: 0,
    publishedAt: new Date().toISOString(),
    cachedAt: new Date().toISOString(),
  };
  return {
    isReady: jest.fn().mockResolvedValue(true),
    getMeta: jest.fn().mockResolvedValue(meta),
    getRules: jest.fn().mockResolvedValue(opts.rules ?? NSAID_PREGNANCY_RULES),
    getIngredientsMap: jest.fn().mockResolvedValue(opts.ingredients ?? {}),
    getDrugClassesMap: jest.fn().mockResolvedValue({}),
    getClassIndex: jest.fn().mockResolvedValue(classIndex),
    getValueSets: jest.fn().mockResolvedValue(opts.valueSets ?? nsaidValueSets()),
  } as unknown as MedicationSafetyCacheService;
}

function isNsaidPregnancyFinding(f: { ruleCode?: string; findingType?: string; ruleDomain?: string }) {
  return (
    f.findingType === 'pregnancy' &&
    /SYSTEMIC-NSAID|PREG-NSAID|NSAID-GA/i.test(f.ruleCode ?? '')
  );
}

async function evaluate(productName: string, weeks: number, genericName?: string, extra?: { route?: string }) {
  const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
  return evaluator.evaluate({
    patientContext: {
      allergies: [],
      pregnancy: { status: 'pregnant', gestationalAgeWeeks: weeks },
    },
    selectedMedications: [
      { productName, genericName: genericName ?? productName, route: extra?.route ?? 'Oral' },
    ],
  });
}

describe('Acetaminophen must not match NSAID pregnancy rules', () => {
  it.each([
    ['PREG-01', 12],
    ['PREG-02', 20],
    ['PREG-03', 27.9],
    ['PREG-04', 28],
    ['PREG-05', 39],
  ])('%s: acetaminophen oral at %s weeks has no NSAID pregnancy finding', async (_id, weeks) => {
    const result = await evaluate('PRESCRIPTION ACETAMINOPHEN', weeks, 'acetaminophen');
    expect(result.findings.filter(isNsaidPregnancyFinding)).toHaveLength(0);
    expect(result.findings.filter((f) => f.ruleDomain === 'ALLERGY')).toHaveLength(0);
    expect(result.findings.filter((f) => f.findingType === 'allergy')).toHaveLength(0);

    const mapped = mapSafetyEvalToMedication({
      medicationName: 'PRESCRIPTION ACETAMINOPHEN',
      genericName: 'acetaminophen',
      findings: result.findings,
      patientAllergies: [],
    });
    expect(mapped.allergyWarning).toBeUndefined();
    expect(mapped.safetyReviewItems.some((i) => i.safetyDomain === 'allergy')).toBe(false);
    expect(mapped.safetyReviewItems.some((i) => /systemic NSAID/i.test(i.summary))).toBe(false);
    expect(mapped.safetyTier).not.toBe('AVOID');
  });

  it('PREG-06: ibuprofen oral at 19.9 weeks has no NSAID pregnancy match', async () => {
    const result = await evaluate('Ibuprofen', 19.9, 'ibuprofen');
    expect(result.findings.filter(isNsaidPregnancyFinding)).toHaveLength(0);
  });

  it('PREG-07 / PREG-08: ibuprofen at 20 and 27.9 matches GA20-27 only', async () => {
    for (const weeks of [20, 27.9]) {
      const result = await evaluate('Ibuprofen', weeks, 'ibuprofen');
      const codes = result.findings.filter(isNsaidPregnancyFinding).map((f) => f.ruleCode);
      expect(codes).toEqual(['SS-PREG-SYSTEMIC-NSAID-GA20-27']);
      expect(result.findings[0]?.ruleDomain).toBe('PREGNANCY');
    }
  });

  it('PREG-09 / PREG-10: ibuprofen at 28 and 39 matches GA28-PLUS only', async () => {
    for (const weeks of [28, 39]) {
      const result = await evaluate('Ibuprofen', weeks, 'ibuprofen');
      const codes = result.findings.filter(isNsaidPregnancyFinding).map((f) => f.ruleCode);
      expect(codes).toEqual(['SS-PREG-SYSTEMIC-NSAID-GA28-PLUS']);
      expect(result.findings.every((f) => f.overrideAllowed)).toBe(true);
      const mapped = mapSafetyEvalToMedication({
        medicationName: 'Ibuprofen',
        genericName: 'ibuprofen',
        findings: result.findings,
        patientAllergies: [],
      });
      expect(mapped.safetyReviewItems.every((i) => i.safetyDomain === 'pregnancy')).toBe(true);
      expect(mapped.safetyReviewItems.some((i) => i.safetyDomain === 'allergy')).toBe(false);
      expect(mapped.safetyTier).toBe('REVIEW_REQUIRED');
      expect(mapped.allergyBlocked).toBe(false);
    }
  });

  it('PREG-11: topical diclofenac at 28 weeks has no systemic NSAID pregnancy match', async () => {
    const result = await evaluate('Diclofenac cream', 28, 'diclofenac', { route: 'Topical' });
    expect(result.findings.filter(isNsaidPregnancyFinding)).toHaveLength(0);
  });

  it('does not apply ibuprofen findings to acetaminophen when both are evaluated together', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        pregnancy: { status: 'pregnant', gestationalAgeWeeks: 28 },
      },
      selectedMedications: [
        { productName: 'PRESCRIPTION ACETAMINOPHEN', genericName: 'acetaminophen', route: 'Oral' },
        { productName: 'ibuprofen', genericName: 'ibuprofen', route: 'Oral' },
        { productName: 'naproxen sodium', genericName: 'naproxen', route: 'Oral' },
      ],
    });
    const apap = mapSafetyEvalToMedication({
      medicationName: 'PRESCRIPTION ACETAMINOPHEN',
      genericName: 'acetaminophen',
      findings: result.findings,
      patientAllergies: [],
    });
    const ibu = mapSafetyEvalToMedication({
      medicationName: 'ibuprofen',
      genericName: 'ibuprofen',
      findings: result.findings,
      patientAllergies: [],
    });
    expect(apap.safetyReviewItems.filter((i) => i.safetyDomain === 'pregnancy')).toHaveLength(0);
    expect(apap.safetyTier).not.toBe('AVOID');
    expect(ibu.safetyReviewItems).toHaveLength(1);
    expect(ibu.safetyReviewItems[0]?.ruleCode).toBe('SS-PREG-SYSTEMIC-NSAID-GA28-PLUS');
    expect(ibu.safetyReviewItems[0]?.safetyDomain).toBe('pregnancy');
  });

  it('stale-state: switching ibuprofen → acetaminophen drops NSAID findings', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const ibuEval = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        pregnancy: { status: 'pregnant', gestationalAgeWeeks: 28 },
      },
      selectedMedications: [{ productName: 'Ibuprofen', genericName: 'ibuprofen', route: 'Oral' }],
    });
    const ibuMapped = mapSafetyEvalToMedication({
      medicationName: 'Ibuprofen',
      genericName: 'ibuprofen',
      findings: ibuEval.findings,
      patientAllergies: [],
    });
    expect(ibuMapped.safetyReviewItems).toHaveLength(1);

    const apapEval = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        pregnancy: { status: 'pregnant', gestationalAgeWeeks: 28 },
      },
      selectedMedications: [{ productName: 'Acetaminophen', genericName: 'acetaminophen', route: 'Oral' }],
    });
    const fresh = mapSafetyEvalToMedication({
      medicationName: 'Acetaminophen',
      genericName: 'acetaminophen',
      findings: apapEval.findings,
      patientAllergies: [],
    });
    const overlaid = overlayTreatmentSafety(
      {
        medicationName: 'Acetaminophen',
        genericName: 'acetaminophen',
        safetyReviewItems: ibuMapped.safetyReviewItems,
        safetyTier: ibuMapped.safetyTier,
        pregnancyWarning: ibuMapped.pregnancyWarning,
      },
      {
        safetyReviewItems: fresh.safetyReviewItems,
        safetyTier: fresh.safetyTier,
        pregnancyWarning: fresh.pregnancyWarning,
        allergyWarning: fresh.allergyWarning,
        allergyBlocked: fresh.allergyBlocked,
      },
    );
    expect((overlaid.safetyReviewItems as unknown[]).length).toBe(0);
    expect(overlaid.safetyTier).not.toBe('AVOID');
  });
});
