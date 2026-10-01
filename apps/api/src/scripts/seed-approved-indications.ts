/**
 * Bootstrap governed Approved Indications (MedicationIndicationMapping) from the
 * Renew starter condition library + RenewMedicationIndicationMap rows.
 *
 * Usage (repo root, DATABASE_URL set):
 *   pnpm db:seed:approved-indications
 *
 * Idempotent — safe to re-run on deploy.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  RENEW_STARTER_CONDITIONS,
  RENEW_STARTER_INDICATION_MAPS,
  normalizeConditionAlias,
} from '../modules/consultations/renew-condition-library.data';

const SNOMED_SYSTEM = 'http://snomed.info/sct';

/**
 * SNOMED CT concept ids for Renew workbook conditions that are not in the
 * starter library. Used only to bridge legacy maps → governed repository.
 */
const WORKBOOK_CONDITION_SNOMED: Record<string, string> = {
  ACS: '394659003',
  ADHD: '406506008',
  ALLERGIC_RHINITIS: '61582004',
  ALZHEIMER_DEMENTIA: '26929004',
  ANGINA: '233819005',
  ARRHYTHMIA: '698247007',
  ASCVD_PREVENTION: '22298006',
  ASCVD_SECONDARY_PREVENTION: '22298006',
  BINGE_EATING_DISORDER: '78004001',
  BIPOLAR_DISORDER: '13746004',
  BULIMIA_NERVOSA: '78004001',
  CHRONIC_IDIOPATHIC_CONSTIPATION: '236069009',
  DIABETIC_NEPHROPATHY: '127013003',
  EDEMA: '267038008',
  EXERCISE_INDUCED_BRONCHOSPASM: '233683003',
  FIBROMYALGIA: '203082005',
  GLUCOCORTICOID_INDUCED_OSTEOPOROSIS: '203465002',
  HYPERALDOSTERONISM: '190507007',
  IBD: '24526004',
  IBS_C: '10743008',
  MALE_PATTERN_HAIR_LOSS: '87872006',
  MDD_ADJUNCT: '370143000',
  MIGRAINE_PROPHYLAXIS: '37796009',
  NEUROGENIC_BLADDER: '397732007',
  NVP: '450423000',
  OBESITY: '414916001',
  OCD: '191736004',
  PANIC_DISORDER: '371631005',
  PARKINSONS_DISEASE: '49049000',
  PARKINSON_DEMENTIA: '425390006',
  PSORIASIS: '9014002',
  PTSD: '47505003',
  RA: '69896004',
  RESTLESS_LEGS: '32914008',
  SCHIZOPHRENIA: '58214004',
  SLE: '55464009',
  SMOKING_CESSATION: '110483000',
  SOCIAL_ANXIETY: '25501002',
  TRIGEMINAL_NEURALGIA: '31681005',
  URIC_ACID_STONES: '236711008',
  VENTRICULAR_ARRHYTHMIA: '71908006',
};

function relationshipFromLegacyStrength(strength: string): string {
  if (strength === 'primary') return 'approved_indication';
  if (strength === 'common') return 'guideline_supported';
  if (strength === 'possible' || strength === 'rare') return 'other';
  return 'approved_indication';
}

async function upsertStarterConditions(prisma: PrismaClient) {
  for (const condition of RENEW_STARTER_CONDITIONS) {
    const snomed = condition.snomedConceptId?.trim() || null;
    const row = await prisma.renewCondition.upsert({
      where: { code: condition.code },
      update: {
        displayName: condition.displayName,
        category: condition.category,
        description: condition.description,
        defaultEffectivenessQuestion: condition.defaultEffectivenessQuestion,
        commonForRenewal: condition.commonForRenewal,
        displayPriority: condition.displayPriority,
        active: true,
        ...(snomed
          ? { codeSystem: SNOMED_SYSTEM, externalCode: snomed }
          : {}),
      },
      create: {
        code: condition.code,
        displayName: condition.displayName,
        category: condition.category,
        description: condition.description,
        defaultEffectivenessQuestion: condition.defaultEffectivenessQuestion,
        commonForRenewal: condition.commonForRenewal,
        displayPriority: condition.displayPriority,
        ...(snomed
          ? { codeSystem: SNOMED_SYSTEM, externalCode: snomed }
          : {}),
      },
    });

    for (const alias of condition.aliases) {
      const normalizedAlias = normalizeConditionAlias(alias);
      if (!normalizedAlias) continue;
      await prisma.renewConditionAlias.upsert({
        where: {
          conditionId_normalizedAlias: { conditionId: row.id, normalizedAlias },
        },
        update: { alias, active: true },
        create: { conditionId: row.id, alias, normalizedAlias, active: true },
      });
    }
  }
}

/** Attach SNOMED codes to workbook-imported RenewCondition rows (idempotent). */
async function attachWorkbookSnomedCodes(prisma: PrismaClient) {
  let updated = 0;
  for (const [code, snomed] of Object.entries(WORKBOOK_CONDITION_SNOMED)) {
    const result = await prisma.renewCondition.updateMany({
      where: { code, active: true },
      data: { codeSystem: SNOMED_SYSTEM, externalCode: snomed },
    });
    updated += result.count;
  }
  return updated;
}

async function upsertStarterMaps(prisma: PrismaClient) {
  const conditions = await prisma.renewCondition.findMany({
    select: { id: true, code: true },
  });
  const byCode = new Map(conditions.map((row) => [row.code, row.id]));

  for (const map of RENEW_STARTER_INDICATION_MAPS) {
    const conditionId = byCode.get(map.conditionCode);
    if (!conditionId) continue;
    await prisma.renewMedicationIndicationMap.upsert({
      where: {
        medicationConceptId_conditionId: {
          medicationConceptId: map.ingredientKey,
          conditionId,
        },
      },
      update: {
        mappingStrength: map.mappingStrength,
        rankingWeight: map.rankingWeight,
        autoGroupAllowed: map.autoGroupAllowed,
        alwaysRequireConfirmation: map.alwaysRequireConfirmation,
        active: true,
      },
      create: {
        medicationConceptId: map.ingredientKey,
        ingredientId: map.ingredientKey.toUpperCase(),
        drugName: map.ingredientKey.replace(/\b\w/g, (c) => c.toUpperCase()),
        conditionId,
        mappingStrength: map.mappingStrength,
        rankingWeight: map.rankingWeight,
        autoGroupAllowed: map.autoGroupAllowed,
        alwaysRequireConfirmation: map.alwaysRequireConfirmation,
        commonIndication: true,
        active: true,
      },
    });
  }
}

async function bootstrapGovernedMappings(prisma: PrismaClient) {
  const legacyMaps = await prisma.renewMedicationIndicationMap.findMany({
    where: { active: true },
    include: {
      condition: {
        select: {
          id: true,
          code: true,
          displayName: true,
          externalCode: true,
          active: true,
        },
      },
    },
  });

  let created = 0;
  let skippedExisting = 0;
  let skippedNoSnomed = 0;
  let skippedOther = 0;

  for (const map of legacyMaps) {
    const condition = map.condition;
    if (!condition?.active || condition.code === 'OTHER_CUSTOM') {
      skippedOther += 1;
      continue;
    }
    const snomed = condition.externalCode?.trim();
    if (!snomed || !/^\d+$/.test(snomed)) {
      skippedNoSnomed += 1;
      continue;
    }

    const medicationConceptId = map.medicationConceptId.trim().toLowerCase();
    const medicationDisplayName =
      map.drugName?.trim() ||
      map.ingredientId?.trim().replace(/_/g, ' ') ||
      medicationConceptId;
    const relationshipType = relationshipFromLegacyStrength(map.mappingStrength);

    const existing = await prisma.medicationIndicationMapping.findFirst({
      where: {
        medicationConceptId,
        medicationMappingLevel: 'ingredient',
        indicationConceptId: snomed,
        relationshipType,
        jurisdiction: 'CA',
        status: 'approved',
      },
      select: { id: true },
    });
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    await prisma.medicationIndicationMapping.create({
      data: {
        medicationConceptId,
        medicationDisplayName,
        medicationMappingLevel: 'ingredient',
        indicationConceptId: snomed,
        indicationDisplayName: condition.displayName,
        relationshipType,
        jurisdiction: 'CA',
        sourceLabel: 'SafeScribe starter library',
        sourceReferenceId: `legacy-map:${map.id}`,
        status: 'approved',
        mappingVersion: 1,
        notes: `Bootstrapped from RenewMedicationIndicationMap (${condition.code}).`,
        legacyConditionId: condition.id,
      },
    });
    created += 1;
  }

  return {
    scanned: legacyMaps.length,
    created,
    skippedExisting,
    skippedNoSnomed,
    skippedOther,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('=== SafeScribe Approved Indications bootstrap ===');
    console.log('1) Upserting starter conditions (with SNOMED codes)…');
    await upsertStarterConditions(prisma);
    console.log('2) Attaching SNOMED codes to workbook conditions…');
    const workbookSnomed = await attachWorkbookSnomedCodes(prisma);
    console.log(`   updated ${workbookSnomed} workbook condition(s)`);
    console.log('3) Upserting starter medication→condition maps…');
    await upsertStarterMaps(prisma);
    console.log('4) Promoting legacy maps into governed repository…');
    const result = await bootstrapGovernedMappings(prisma);

    const approved = await prisma.medicationIndicationMapping.count({
      where: { status: 'approved' },
    });
    const candidates = await prisma.medicationIndicationCandidate.count({
      where: { status: 'pending' },
    });
    const snomedConditions = await prisma.renewCondition.count({
      where: { active: true, externalCode: { not: null } },
    });

    console.log('\n=== Bootstrap result ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n=== Live counts ===');
    console.log(
      JSON.stringify(
        {
          approvedMappings: approved,
          pendingCandidates: candidates,
          conditionsWithSnomed: snomedConditions,
        },
        null,
        2,
      ),
    );
    console.log('=== DONE ===');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
