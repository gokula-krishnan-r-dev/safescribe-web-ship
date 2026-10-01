/**
 * Seed initial safety engine data: default rules, ingredients, and optional legacy migration.
 * Run: npx tsx prisma/scripts/seed-safety-engine.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_DDI_RULES = [
  {
    code: 'DDI-AZITHROMYCIN-AMIODARONE',
    ruleType: 'DRUG_INTERACTION' as const,
    summary: 'Interaction: azithromycin + amiodarone',
    detail: 'QT prolongation risk',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'Do not co-prescribe without specialist review',
    overrideAllowed: false,
    overrideReasonRequired: false,
    ddiDetail: {
      drugA: 'azithromycin',
      drugB: 'amiodarone',
      interactionSeverity: 'MAJOR' as const,
      actionRequired: 'HARD_STOP' as const,
    },
  },
  {
    code: 'DDI-CIPROFLOXACIN-PREDNISONE',
    ruleType: 'DRUG_INTERACTION' as const,
    summary: 'Interaction: ciprofloxacin + prednisone',
    detail: 'Increased tendon rupture risk',
    clinicalSeverity: 'MODERATE' as const,
    recommendedAction: 'Pharmacist review required before continuing',
    overrideAllowed: true,
    overrideReasonRequired: true,
    ddiDetail: {
      drugA: 'ciprofloxacin',
      drugB: 'prednisone',
      interactionSeverity: 'MODERATE' as const,
      actionRequired: 'PHARMACIST_REVIEW' as const,
    },
  },
];

const DEFAULT_PREGNANCY_RULES = [
  {
    code: 'PREG-ISOTRETINOIN',
    ruleType: 'PREGNANCY' as const,
    summary: 'isotretinoin — contraindicated in pregnancy',
    detail: 'teratogenic. do not use',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'do not use',
    overrideAllowed: false,
    overrideReasonRequired: false,
    pregnancyDetail: {
      drugName: 'isotretinoin',
      pregnancyCategory: 'CONTRAINDICATED' as const,
      trimester: 'all',
      clinicalNote: 'teratogenic',
      actionRequired: 'HARD_STOP' as const,
    },
  },
  {
    code: 'PREG-WARFARIN',
    ruleType: 'PREGNANCY' as const,
    summary: 'warfarin — contraindicated in pregnancy',
    detail: 'fetal bleeding risk. avoid',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'avoid',
    overrideAllowed: false,
    overrideReasonRequired: false,
    pregnancyDetail: {
      drugName: 'warfarin',
      pregnancyCategory: 'CONTRAINDICATED' as const,
      trimester: 'all',
      clinicalNote: 'fetal bleeding risk',
      actionRequired: 'HARD_STOP' as const,
    },
  },
  {
    code: 'PREG-RAMIPRIL',
    ruleType: 'PREGNANCY' as const,
    summary: 'ramipril — contraindicated in pregnancy',
    detail: 'fetal renal damage. avoid',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'avoid',
    overrideAllowed: false,
    overrideReasonRequired: false,
    pregnancyDetail: {
      drugName: 'ramipril',
      pregnancyCategory: 'CONTRAINDICATED' as const,
      trimester: 'all',
      clinicalNote: 'fetal renal damage',
      actionRequired: 'HARD_STOP' as const,
    },
  },
];

const DEFAULT_LAB_RULES = [
  {
    code: 'LAB-METFORMIN-EGFR-30',
    ruleType: 'LAB_THRESHOLD' as const,
    summary: 'eGFR below 30 mL/min',
    detail: 'Patient eGFR is {lab_value} mL/min. Metformin is contraindicated when eGFR < 30.',
    clinicalSeverity: 'HIGH' as const,
    recommendedAction: 'Avoid or use specialist-guided dose reduction',
    labDetail: {
      drugIngredient: 'metformin',
      observationKey: 'egfr',
      observationDisplay: 'eGFR',
      loincCode: '33914-3',
      comparator: 'LT' as const,
      thresholdLow: 30,
      thresholdHigh: null,
      expectedUnit: 'mL/min',
      maxAgeDays: 365,
      missingLabAction: 'REQUIRE_REVIEW' as const,
    },
  },
  {
    code: 'LAB-METFORMIN-EGFR-45',
    ruleType: 'LAB_THRESHOLD' as const,
    summary: 'eGFR below 45 mL/min',
    detail: 'Patient eGFR is {lab_value} mL/min. Metformin dose reduction is recommended when eGFR < 45.',
    clinicalSeverity: 'MODERATE' as const,
    recommendedAction: 'Reduce dose and monitor renal function',
    labDetail: {
      drugIngredient: 'metformin',
      observationKey: 'egfr',
      observationDisplay: 'eGFR',
      comparator: 'LT' as const,
      thresholdLow: 45,
      thresholdHigh: null,
      expectedUnit: 'mL/min',
      maxAgeDays: 365,
      missingLabAction: 'REQUIRE_REVIEW' as const,
    },
  },
];

const DEFAULT_LACTATION_RULES = [
  {
    code: 'LACT-CODEINE',
    ruleType: 'LACTATION' as const,
    summary: 'codeine — lactation risk',
    detail: 'risk of infant respiratory depression. avoid',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'avoid',
    overrideAllowed: false,
    overrideReasonRequired: false,
    lactationDetail: {
      drugName: 'codeine',
      lactationRisk: 'HIGH_RISK' as const,
      bandSeverity: 'BLOCK' as const,
      clinicalNote: 'risk of infant respiratory depression',
      actionRequired: 'HARD_STOP' as const,
    },
  },
  {
    code: 'LACT-TRAMADOL',
    ruleType: 'LACTATION' as const,
    summary: 'tramadol — lactation risk',
    detail: 'CNS depression risk. avoid',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'avoid',
    overrideAllowed: false,
    overrideReasonRequired: false,
    lactationDetail: {
      drugName: 'tramadol',
      lactationRisk: 'HIGH_RISK' as const,
      bandSeverity: 'BLOCK' as const,
      clinicalNote: 'CNS depression risk',
      actionRequired: 'HARD_STOP' as const,
    },
  },
];

const DEFAULT_RENAL_RULES = [
  {
    code: 'RENAL-METFORMIN-0-29',
    ruleType: 'RENAL_EGFR_BAND' as const,
    summary: 'metformin renal band eGFR 0–29',
    detail: 'lactic acidosis risk. contraindicated',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'contraindicated',
    overrideAllowed: false,
    overrideReasonRequired: false,
    renalDetail: {
      drugName: 'metformin',
      egfrMin: 0,
      egfrMax: 29,
      bandSeverity: 'BLOCK' as const,
      clinicalNote: 'lactic acidosis risk',
      actionRequired: 'HARD_STOP' as const,
    },
  },
  {
    code: 'RENAL-METFORMIN-30-44',
    ruleType: 'RENAL_EGFR_BAND' as const,
    summary: 'metformin renal band eGFR 30–44',
    detail: 'reduced clearance. reduce dose / review',
    clinicalSeverity: 'MODERATE' as const,
    recommendedAction: 'reduce dose / review',
    overrideAllowed: true,
    overrideReasonRequired: true,
    renalDetail: {
      drugName: 'metformin',
      egfrMin: 30,
      egfrMax: 44,
      bandSeverity: 'CAUTION' as const,
      clinicalNote: 'reduced clearance',
      actionRequired: 'PHARMACIST_REVIEW' as const,
    },
  },
  {
    code: 'RENAL-METFORMIN-45-999',
    ruleType: 'RENAL_EGFR_BAND' as const,
    summary: 'metformin renal band eGFR 45–999',
    detail: 'standard dosing',
    clinicalSeverity: 'INFO' as const,
    recommendedAction: 'standard dosing',
    overrideAllowed: true,
    overrideReasonRequired: false,
    renalDetail: {
      drugName: 'metformin',
      egfrMin: 45,
      egfrMax: 999,
      bandSeverity: 'SAFE' as const,
      clinicalNote: null,
      actionRequired: 'NONE' as const,
    },
  },
  {
    code: 'RENAL-IBUPROFEN-0-29',
    ruleType: 'RENAL_EGFR_BAND' as const,
    summary: 'ibuprofen renal band eGFR 0–29',
    detail: 'AKI risk. avoid',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'avoid',
    overrideAllowed: false,
    overrideReasonRequired: false,
    renalDetail: {
      drugName: 'ibuprofen',
      egfrMin: 0,
      egfrMax: 29,
      bandSeverity: 'BLOCK' as const,
      clinicalNote: 'AKI risk',
      actionRequired: 'HARD_STOP' as const,
    },
  },
];

const DEFAULT_INGREDIENTS = [
  {
    productName: 'Clavulin 875 mg / 125 mg tablet',
    genericName: 'amoxicillin-clavulanate',
    ingredients: ['amoxicillin', 'clavulanic acid'],
  },
  { productName: 'Amoxil 500 mg capsule', genericName: 'amoxicillin', ingredients: ['amoxicillin'] },
  {
    productName: 'Augmentin 875 mg tablet',
    genericName: 'amoxicillin-clavulanate',
    ingredients: ['amoxicillin', 'clavulanic acid'],
  },
];

const DEFAULT_RULES = [
  {
    code: 'ALLERGY-AMOX-DIRECT',
    ruleType: 'ALLERGY_DIRECT' as const,
    summary: 'Recorded amoxicillin allergy',
    detail: 'Patient has a recorded allergy to amoxicillin.',
    clinicalSeverity: 'HIGH' as const,
    recommendedAction: 'Review allergy history before proceeding',
    matchType: 'exact_ingredient' as const,
    participants: [
      { participantKey: 'allergen', selectorType: 'EXACT_INGREDIENT' as const, conceptText: 'amoxicillin' },
      { participantKey: 'trigger_substance', selectorType: 'EXACT_INGREDIENT' as const, conceptText: 'amoxicillin' },
    ],
  },
  {
    code: 'ALLERGY-AMOX-COMBO',
    ruleType: 'ALLERGY_DIRECT' as const,
    summary: 'Product contains amoxicillin',
    detail: 'The selected product contains amoxicillin as an active ingredient.',
    clinicalSeverity: 'CRITICAL' as const,
    recommendedAction: 'Select an alternative when clinically appropriate',
    matchType: 'combination_product_contains_exact_ingredient' as const,
    participants: [
      { participantKey: 'allergen', selectorType: 'EXACT_INGREDIENT' as const, conceptText: 'amoxicillin' },
      { participantKey: 'trigger_substance', selectorType: 'HAS_INGREDIENT' as const, conceptText: 'amoxicillin' },
    ],
  },
];

const DEFAULT_CLASSES = [
  { drugName: 'amoxicillin', className: 'penicillin' },
  { drugName: 'penicillin v', className: 'penicillin' },
  { drugName: 'ampicillin', className: 'penicillin' },
];

const DEFAULT_DRUG_CLASS_TAXONOMY = [
  { className: 'penicillin', parentClass: 'beta-lactam', therapeuticGroup: 'antibiotic', riskTags: ['allergy'] },
  { className: 'cephalosporin', parentClass: 'beta-lactam', therapeuticGroup: 'antibiotic', riskTags: ['allergy'] },
  { className: 'macrolide', parentClass: 'antibiotic', therapeuticGroup: 'antibiotic', riskTags: ['qt'] },
  { className: 'fluoroquinolone', parentClass: 'antibiotic', therapeuticGroup: 'antibiotic', riskTags: ['tendon'] },
  { className: 'nsaid', parentClass: 'anti-inflammatory', therapeuticGroup: 'analgesic', riskTags: ['renal', 'gi', 'allergy'] },
  { className: 'ace inhibitor', parentClass: 'raas inhibitor', therapeuticGroup: 'cardiovascular', riskTags: ['renal', 'potassium'] },
  { className: 'ssri', parentClass: 'antidepressant', therapeuticGroup: 'cns', riskTags: [] },
  { className: 'biguanide', parentClass: 'antidiabetic', therapeuticGroup: 'endocrine', riskTags: ['renal'] },
  { className: 'tetracycline', parentClass: 'antibiotic', therapeuticGroup: 'antibiotic', riskTags: [] },
  { className: 'beta-lactam', parentClass: null, therapeuticGroup: 'antibiotic', riskTags: ['allergy'] },
];

const DEFAULT_DRUG_CATALOG = [
  { drugName: 'amoxicillin', className: 'penicillin', ingredient: 'amoxicillin', commonBrands: ['amoxil'], notes: 'very common' },
  { drugName: 'cephalexin', className: 'cephalosporin', ingredient: 'cephalexin', commonBrands: ['keflex'], notes: null },
  { drugName: 'azithromycin', className: 'macrolide', ingredient: 'azithromycin', commonBrands: ['zithromax'], notes: 'QT risk' },
  { drugName: 'ciprofloxacin', className: 'fluoroquinolone', ingredient: 'ciprofloxacin', commonBrands: ['cipro'], notes: 'tendon risk' },
  { drugName: 'ibuprofen', className: 'nsaid', ingredient: 'ibuprofen', commonBrands: ['advil'], notes: 'renal/GI' },
  { drugName: 'ramipril', className: 'ace inhibitor', ingredient: 'ramipril', commonBrands: ['altace'], notes: 'renal/K+' },
  { drugName: 'sertraline', className: 'ssri', ingredient: 'sertraline', commonBrands: ['zoloft'], notes: null },
  { drugName: 'metformin', className: 'biguanide', ingredient: 'metformin', commonBrands: [], notes: 'renal critical' },
  { drugName: 'doxycycline', className: 'tetracycline', ingredient: 'doxycycline', commonBrands: ['vibramycin'], notes: 'acne, RTI' },
];

async function main() {
  console.log('Seeding safety engine data...');

  for (const ing of DEFAULT_INGREDIENTS) {
    await prisma.medicationIngredient.upsert({
      where: { productName: ing.productName },
      create: ing,
      update: { genericName: ing.genericName, ingredients: ing.ingredients },
    });
  }

  for (const cls of DEFAULT_CLASSES) {
    await prisma.drugClassMembership.upsert({
      where: { drugName_className: { drugName: cls.drugName, className: cls.className } },
      create: cls,
      update: {},
    });
  }

  for (const row of DEFAULT_DRUG_CLASS_TAXONOMY) {
    await prisma.drugClassTaxonomy.upsert({
      where: { className: row.className },
      create: row,
      update: {
        parentClass: row.parentClass,
        therapeuticGroup: row.therapeuticGroup,
        riskTags: row.riskTags,
      },
    });
  }

  for (const row of DEFAULT_DRUG_CATALOG) {
    await prisma.drugCatalog.upsert({
      where: { drugName: row.drugName },
      create: row,
      update: {
        className: row.className,
        ingredient: row.ingredient,
        commonBrands: row.commonBrands,
        notes: row.notes,
      },
    });
    await prisma.drugClassMembership.upsert({
      where: { drugName_className: { drugName: row.drugName, className: row.className } },
      create: { drugName: row.drugName, className: row.className },
      update: {},
    });
  }

  const allRules = [
    ...DEFAULT_RULES,
    ...DEFAULT_LAB_RULES,
    ...DEFAULT_DDI_RULES,
    ...DEFAULT_PREGNANCY_RULES,
    ...DEFAULT_LACTATION_RULES,
    ...DEFAULT_RENAL_RULES,
  ];

  for (const rule of allRules) {
    const existing = await prisma.safetyKnowledgeRule.findUnique({ where: { code: rule.code } });
    if (existing) continue;

    const {
      labDetail,
      ddiDetail,
      pregnancyDetail,
      lactationDetail,
      renalDetail,
      participants,
      matchType,
      overrideAllowed,
      overrideReasonRequired,
      ...ruleData
    } = rule as typeof rule & {
      labDetail?: (typeof DEFAULT_LAB_RULES)[0]['labDetail'];
      ddiDetail?: (typeof DEFAULT_DDI_RULES)[0]['ddiDetail'];
      pregnancyDetail?: (typeof DEFAULT_PREGNANCY_RULES)[0]['pregnancyDetail'];
      lactationDetail?: (typeof DEFAULT_LACTATION_RULES)[0]['lactationDetail'];
      renalDetail?: (typeof DEFAULT_RENAL_RULES)[0]['renalDetail'];
      participants?: (typeof DEFAULT_RULES)[0]['participants'];
      matchType?: string;
      overrideAllowed?: boolean;
      overrideReasonRequired?: boolean;
    };

    const section =
      ruleData.ruleType === 'LAB_THRESHOLD'
        ? 'Renal Lab'
        : ruleData.ruleType === 'DRUG_INTERACTION'
          ? 'DDI'
          : ruleData.ruleType === 'PREGNANCY'
            ? 'Pregnancy'
            : ruleData.ruleType === 'LACTATION'
              ? 'Lactation'
              : ruleData.ruleType === 'RENAL_EGFR_BAND'
                ? 'Renal eGFR'
                : 'Allergy MVP';

    await prisma.safetyKnowledgeRule.create({
      data: {
        code: ruleData.code,
        ruleType: ruleData.ruleType,
        jurisdiction: 'ALL',
        versions: {
          create: {
            versionNumber: 1,
            status: 'APPROVED',
            summary: ruleData.summary,
            detail: ruleData.detail,
            clinicalSeverity: ruleData.clinicalSeverity,
            recommendedAction: ruleData.recommendedAction,
            matchType: matchType ?? null,
            overrideAllowed: overrideAllowed ?? true,
            overrideReasonRequired: overrideReasonRequired ?? true,
            approvedAt: new Date(),
            participants: participants?.length ? { create: participants } : undefined,
            labDetail: labDetail ? { create: labDetail } : undefined,
            ddiDetail: ddiDetail ? { create: ddiDetail } : undefined,
            pregnancyDetail: pregnancyDetail ? { create: pregnancyDetail } : undefined,
            lactationDetail: lactationDetail ? { create: lactationDetail } : undefined,
            renalDetail: renalDetail ? { create: renalDetail } : undefined,
            evidence: {
              create: {
                source: 'SafeScribe Clinical Policy',
                section,
                accessDate: new Date(),
              },
            },
          },
        },
      },
    });
  }

  console.log('Safety engine seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
