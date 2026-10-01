import { MedicationSafetyEvaluatorService } from './medication-safety-evaluator.service';
import { MedicationSafetyCacheService } from './medication-safety-cache.service';
import { SAFETY_EVAL_STATUSES } from '@safescript/shared';
import {
  CachedIngredientEntry,
  CachedReleaseMeta,
  CachedSafetyRule,
} from './medication-safety.types';
import { buildClassIndex, type CachedClassIndex } from './utils/class-index.util';

function mockCache(opts: {
  rules?: CachedSafetyRule[];
  ingredients?: Record<string, CachedIngredientEntry>;
  drugClasses?: Record<string, string[]>;
  classIndex?: CachedClassIndex;
  valueSets?: import('./medication-safety.types').CachedValueSet[];
  ready?: boolean;
}) {
  const classIndex =
    opts.classIndex ??
    buildClassIndex({
      taxonomyRows: [],
      catalogRows: [],
      membershipRows: Object.entries(opts.drugClasses ?? {}).flatMap(([drug, classes]) =>
        classes.map((className) => ({ drugName: drug, className })),
      ),
    });

  const meta: CachedReleaseMeta = {
    releaseId: 'rel-1',
    version: 'KR-TEST-1',
    checksum: 'abc',
    engineVersion: 'safety-engine-1.4.0',
    ruleCount: opts.rules?.length ?? 0,
    ingredientCount: Object.keys(opts.ingredients ?? {}).length,
    classMemberCount: Object.keys(classIndex.drugToDirectClasses).length,
    publishedAt: new Date().toISOString(),
    cachedAt: new Date().toISOString(),
  };

  return {
    isReady: jest.fn().mockResolvedValue(opts.ready ?? true),
    getMeta: jest.fn().mockResolvedValue(meta),
    getRules: jest.fn().mockResolvedValue(opts.rules ?? []),
    getIngredientsMap: jest.fn().mockResolvedValue(opts.ingredients ?? {}),
    getDrugClassesMap: jest.fn().mockResolvedValue(opts.drugClasses ?? classIndex.drugToDirectClasses),
    getClassIndex: jest.fn().mockResolvedValue(classIndex),
    getValueSets: jest.fn().mockResolvedValue(opts.valueSets ?? []),
  } as unknown as MedicationSafetyCacheService;
}

describe('MedicationSafetyEvaluatorService', () => {
  const clavulinIngredients: Record<string, CachedIngredientEntry> = {
    'clavulin 875 mg 125 mg tablet': {
      productName: 'Clavulin 875 mg / 125 mg tablet',
      genericName: 'amoxicillin-clavulanate',
      ingredients: ['amoxicillin', 'clavulanic acid'],
    },
  };

  it('returns SERVICE_UNAVAILABLE when cache is not ready', async () => {
    const cache = mockCache({ ready: false });
    const evaluator = new MedicationSafetyEvaluatorService(cache);
    const result = await evaluator.evaluate({
      patientContext: { allergies: [{ substance: 'amoxicillin' }] },
      selectedMedications: [{ productName: 'Clavulin 875 mg / 125 mg tablet' }],
    });
    expect(result.status).toBe(SAFETY_EVAL_STATUSES.SERVICE_UNAVAILABLE);
  });

  it('detects amoxicillin allergy + Clavulin combination product alert', async () => {
    const cache = mockCache({ ingredients: clavulinIngredients });
    const evaluator = new MedicationSafetyEvaluatorService(cache);
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [{ substance: 'amoxicillin', clinicalStatus: 'active', verificationStatus: 'confirmed' }],
      },
      selectedMedications: [{ productName: 'Clavulin 875 mg / 125 mg tablet' }],
    });
    expect(result.status).toBe(SAFETY_EVAL_STATUSES.COMPLETE_WITH_FINDINGS);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(
      result.findings.some(
        (f) =>
          f.matchType === 'combination_product_contains_exact_ingredient' ||
          f.matchType === 'exact_ingredient',
      ),
    ).toBe(true);
  });

  it('does not alert amoxicillin allergy + clavulanic acid only', async () => {
    const cache = mockCache({ ingredients: clavulinIngredients });
    const evaluator = new MedicationSafetyEvaluatorService(cache);
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [{ substance: 'amoxicillin', clinicalStatus: 'active' }],
      },
      selectedMedications: [{ productName: 'clavulanic acid' }],
    });
    const allergyFindings = result.findings.filter((f) => f.findingType === 'allergy');
    expect(allergyFindings.length).toBe(0);
  });

  it('does not alert inactive/refuted allergy', async () => {
    const cache = mockCache({ ingredients: clavulinIngredients });
    const evaluator = new MedicationSafetyEvaluatorService(cache);
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [{ substance: 'amoxicillin', clinicalStatus: 'inactive' }],
      },
      selectedMedications: [{ productName: 'Clavulin 875 mg / 125 mg tablet' }],
    });
    expect(result.findings.length).toBe(0);
  });

  it('returns VERIFICATION_INCOMPLETE when ingredients cannot be resolved', async () => {
    const cache = mockCache({ ingredients: {} });
    const evaluator = new MedicationSafetyEvaluatorService(cache);
    const result = await evaluator.evaluate({
      patientContext: { allergies: [{ substance: 'amoxicillin' }] },
      selectedMedications: [{ productName: '??' }],
    });
    expect(result.status).toBe(SAFETY_EVAL_STATUSES.VERIFICATION_INCOMPLETE);
  });

  it('suppresses class alert when exact ingredient alert exists', async () => {
    const rules: CachedSafetyRule[] = [
      {
        ruleId: 'r1',
        versionId: 'v1',
        code: 'CROSS-PEN',
        ruleType: 'CROSS_REACTIVITY',
        jurisdiction: 'ALL',
        summary: 'Class alert',
        detail: 'Same class',
        clinicalSeverity: 'HIGH',
        recommendedAction: 'Review',
        overrideAllowed: true,
        overrideReasonRequired: true,
        matchType: 'same_class',
        relationshipType: 'penicillin_class',
        participants: [
          { participantKey: 'allergen', selectorType: 'EXACT_INGREDIENT', conceptText: 'amoxicillin' },
          { participantKey: 'trigger_substance', selectorType: 'EXACT_INGREDIENT', conceptText: 'amoxicillin' },
        ],
      },
    ];
    const cache = mockCache({ rules, ingredients: clavulinIngredients });
    const evaluator = new MedicationSafetyEvaluatorService(cache);
    const result = await evaluator.evaluate({
      patientContext: { allergies: [{ substance: 'amoxicillin', clinicalStatus: 'active' }] },
      selectedMedications: [{ productName: 'amoxicillin' }],
    });
    const classFindings = result.findings.filter((f) => f.matchType === 'same_class');
    expect(classFindings.length).toBe(0);
    expect(result.suppressedFindings.length).toBeGreaterThan(0);
  });

  it('blocks Abreva via docosanol brand alias', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [{ substance: 'Docosanol', clinicalStatus: 'active' }],
      },
      selectedMedications: [{ productName: 'Abreva' }, { productName: 'Valacyclovir' }],
    });
    expect(result.findings.some((f) => /abreva/i.test(f.implicatedProductName ?? ''))).toBe(true);
    expect(result.findings.some((f) => /valacyclovir/i.test(f.implicatedProductName ?? ''))).toBe(
      false,
    );
  });

  it('applies valacyclovir allergy to topical acyclovir', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [{ substance: 'Valacyclovir', clinicalStatus: 'active' }],
      },
      selectedMedications: [
        { productName: 'Acyclovir' },
        { productName: 'Acyclovir 5% cream' },
        { productName: 'Docosanol 10% cream' },
      ],
    });
    expect(
      result.findings.some((f) => f.implicatedProductName === 'Acyclovir 5% cream'),
    ).toBe(true);
    expect(
      result.findings.some((f) => /docosanol/i.test(f.implicatedProductName ?? '')),
    ).toBe(false);
  });

  it('propagates penicillin-class allergy and cautions cephalexin', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        age: 6,
        allergies: [{ substance: 'Amoxicillin', clinicalStatus: 'active' }],
      },
      selectedMedications: [
        { productName: 'Penicillin V' },
        { productName: 'Cephalexin' },
        { productName: 'Azithromycin' },
      ],
    });
    expect(result.findings.some((f) => f.implicatedProductName === 'Penicillin V')).toBe(true);
    const ceph = result.findings.find((f) => f.implicatedProductName === 'Cephalexin');
    expect(ceph?.clinicalSeverity).toBe('MODERATE');
  });

  it('does not suppress penicillin-class hits on other products when amoxicillin has an exact allergy', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        age: 6,
        allergies: [{ substance: 'Amoxicillin', clinicalStatus: 'active' }],
      },
      selectedMedications: [
        { productName: 'Amoxicillin' },
        { productName: 'Penicillin V' },
        { productName: 'Ampicillin' },
        { productName: 'Azithromycin' },
      ],
    });
    expect(result.findings.some((f) => f.implicatedProductName === 'Penicillin V')).toBe(true);
    expect(result.findings.some((f) => f.implicatedProductName === 'Ampicillin')).toBe(true);
    expect(result.findings.some((f) => /azithromycin/i.test(f.implicatedProductName ?? ''))).toBe(
      false,
    );
  });

  it('ignores discontinued current medications for DDI', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        currentMedications: [
          { productName: 'Simvastatin 40 mg', genericName: 'simvastatin', status: 'discontinued' },
        ],
      },
      selectedMedications: [{ productName: 'Clarithromycin' }],
    });
    expect(result.findings.filter((f) => f.findingType === 'drug_interaction')).toHaveLength(0);
  });

  it('blocks NSAIDs for peptic ulcer and T3 pregnancy', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        conditions: ['Active peptic ulcer disease'],
        pregnancy: { status: 'pregnant', trimester: 'T3' },
      },
      selectedMedications: [{ productName: 'Ibuprofen' }, { productName: 'Acetaminophen' }],
    });
    expect(
      result.findings.some(
        (f) => f.implicatedProductName === 'Ibuprofen' && f.findingType === 'drug_disease',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        (f) => f.implicatedProductName === 'Ibuprofen' && f.findingType === 'pregnancy',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        (f) => f.implicatedProductName === 'Acetaminophen' && f.findingType === 'pregnancy',
      ),
    ).toBe(false);
  });

  it('blocks oral terbinafine in hepatic disease but not cream', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        conditions: ['Chronic active hepatic disease'],
      },
      selectedMedications: [{ productName: 'Terbinafine' }, { productName: 'Terbinafine cream' }],
    });
    expect(
      result.findings.some(
        (f) => f.implicatedProductName === 'Terbinafine' && f.findingType === 'drug_disease',
      ),
    ).toBe(true);
    expect(
      result.findings.some((f) => f.implicatedProductName === 'Terbinafine cream'),
    ).toBe(false);
  });

  it('flags metformin at eGFR 10 and does not renal-alert topical acyclovir', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        conditions: ['Type 2 diabetes mellitus'],
        currentMedications: [{ productName: 'Metformin 1000 mg', genericName: 'metformin' }],
        labs: [{ name: 'eGFR', value: '10', unit: 'mL/min/1.73 m2', observedAt: '2026-06-08' }],
      },
      selectedMedications: [
        { productName: 'Valacyclovir' },
        { productName: 'Acyclovir 5% cream' },
        { productName: 'Metformin 1000 mg' },
      ],
    });
    expect(
      result.findings.some((f) => /metformin/i.test(f.implicatedProductName ?? '')),
    ).toBe(true);
    expect(
      result.findings.some((f) => /valacyclovir/i.test(f.implicatedProductName ?? '')),
    ).toBe(true);
    expect(
      result.findings.some(
        (f) =>
          /renal/i.test(f.findingType) && /Acyclovir 5%/i.test(f.implicatedProductName ?? ''),
      ),
    ).toBe(false);
  });

  it('blocks K 5.0 on spironolactone and not 4.9', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const atLimit = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        labs: [{ name: 'Potassium', value: '5.0', unit: 'mmol/L', observedAt: '2026-08-16' }],
      },
      selectedMedications: [{ productName: 'Spironolactone' }],
    });
    expect(
      atLimit.findings.some(
        (f) => f.findingType === 'renal_lab' && /spironolactone/i.test(f.implicatedProductName ?? ''),
      ),
    ).toBe(true);

    const below = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        labs: [{ name: 'Potassium', value: '4.9', unit: 'mmol/L', observedAt: '2026-08-16' }],
      },
      selectedMedications: [{ productName: 'Spironolactone' }],
    });
    expect(below.findings.some((f) => f.findingType === 'renal_lab')).toBe(false);
  });

  it('flags Advil + Motrin as duplicate ibuprofen', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        pregnancy: { status: 'not pregnant' },
        currentMedications: [{ productName: 'Advil', genericName: 'ibuprofen' }],
      },
      selectedMedications: [{ productName: 'Motrin' }, { productName: 'Acetaminophen' }],
    });
    expect(
      result.findings.some(
        (f) => f.findingType === 'duplicate_therapy' && /motrin/i.test(f.implicatedProductName ?? ''),
      ),
    ).toBe(true);
    expect(
      result.findings.some((f) => /acetaminophen/i.test(f.implicatedProductName ?? '')),
    ).toBe(false);
  });

  it('returns MORE_INFO for pediatric amoxicillin without weight', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: { allergies: [], age: 4 },
      selectedMedications: [{ productName: 'Amoxicillin' }],
    });
    expect(result.status).toBe(SAFETY_EVAL_STATUSES.VERIFICATION_INCOMPLETE);
    expect(result.mappingWarnings.some((w) => /weight/i.test(w))).toBe(true);
  });

  it('caps clopidogrel + omeprazole at HIGH avoid, not a hard CRITICAL block pair', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [],
        currentMedications: [{ productName: 'Clopidogrel 75 mg', genericName: 'clopidogrel' }],
      },
      selectedMedications: [{ productName: 'Omeprazole' }, { productName: 'Pantoprazole' }],
    });
    const ome = result.findings.find((f) => /omeprazole/i.test(f.implicatedProductName ?? ''));
    expect(ome?.findingType).toBe('drug_interaction');
    expect(ome?.clinicalSeverity).toBe('HIGH');
    expect(
      result.findings.some((f) => /pantoprazole/i.test(f.implicatedProductName ?? '')),
    ).toBe(false);
  });

  it('does not treat ZOMIG NASAL SPRAY as a sumatriptan (Imitrex) allergy hit', async () => {
    const classIndex = buildClassIndex({
      taxonomyRows: [{ className: 'triptan' }],
      catalogRows: [
        {
          drugName: 'zolmitriptan',
          className: 'triptan',
          commonBrands: ['zomig', 'zomig rapimelt', 'zomig nasal spray'],
        },
        {
          drugName: 'sumatriptan',
          className: 'triptan',
          commonBrands: ['imitrex', 'imitrex nasal spray'],
        },
      ],
      membershipRows: [
        { drugName: 'zolmitriptan', className: 'triptan' },
        { drugName: 'sumatriptan', className: 'triptan' },
      ],
    });
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({ classIndex }));
    const products = [
      { productName: 'ZOMIG', genericName: 'zolmitriptan', route: 'oral' },
      { productName: 'ZOMIG RAPIMELT', genericName: 'zolmitriptan', route: 'oral' },
      { productName: 'ZOMIG NASAL SPRAY', genericName: 'zolmitriptan', route: 'nasal' },
      { productName: 'IMITREX NASAL SPRAY', genericName: 'sumatriptan', route: 'nasal' },
    ];
    const result = await evaluator.evaluate({
      patientContext: {
        allergies: [{ substance: 'sumatriptan', clinicalStatus: 'active' }],
      },
      selectedMedications: products,
    });

    const implicated = result.findings
      .filter((f) => f.findingType === 'allergy')
      .map((f) => f.implicatedProductName ?? '');

    expect(implicated.some((name) => /imitrex/i.test(name))).toBe(true);
    expect(implicated.some((name) => /zomig/i.test(name))).toBe(false);

    const zomigNasalAllergy = result.findings.filter(
      (f) =>
        f.findingType === 'allergy' && /zomig nasal/i.test(f.implicatedProductName ?? ''),
    );
    expect(zomigNasalAllergy).toHaveLength(0);
  });

  it('does not escalate zolmitriptan to Avoid solely because the route is intranasal', async () => {
    const evaluator = new MedicationSafetyEvaluatorService(mockCache({}));
    const result = await evaluator.evaluate({
      patientContext: { allergies: [] },
      selectedMedications: [
        { productName: 'ZOMIG', genericName: 'zolmitriptan', route: 'oral' },
        { productName: 'ZOMIG NASAL SPRAY', genericName: 'zolmitriptan', route: 'nasal' },
      ],
    });
    expect(result.findings.filter((f) => /zomig/i.test(f.implicatedProductName ?? ''))).toEqual(
      [],
    );
  });
});
