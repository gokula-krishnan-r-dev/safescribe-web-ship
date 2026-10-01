/**
 * Seed a pragmatic CCDD-backed terminology release + import all 12 sample workbooks.
 *
 * Usage (from repo root, with DB + Infoway credentials configured):
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/seed-clinical-repository.ts
 *
 * Or via nest/tsx if available. Requires DATABASE_URL and INFOWAY_CLIENT_ID/SECRET.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SAMPLE_DIR = path.resolve(__dirname, '../../Safety_03082026');

const TERMINOLOGY_QUERIES = [
  'amoxicillin',
  'clavulanic acid',
  'cefadroxil',
  'propranolol',
  'metformin',
  'spironolactone',
  'ibuprofen',
  'naproxen',
  'diclofenac',
  'codeine',
  'sildenafil',
  'nitroglycerin',
  'isosorbide dinitrate',
  'warfarin',
  'methotrexate',
];

const FILE_ORDER = [
  'clinical-value-sets.xlsx',
  'clinical-value-set-members.xlsx',
  'rule-evidence.xlsx',
  'allergy-cross-reactivity-rules.xlsx',
  'drug-interactions.xlsx',
  'drug-disease-rules.xlsx',
  'renal-rules.xlsx',
  'lab-threshold-rules.xlsx',
  'pregnancy-rules.xlsx',
  'lactation-rules.xlsx',
  'test-inputs.xlsx',
  'test-cases.xlsx',
];

async function main() {
  console.log('=== SafeScribe Clinical Repository seed ===');
  console.log('Sample dir:', SAMPLE_DIR);

  // Bootstrap terminology release with local concepts (CCDD live resolve can be done via API)
  let release = await prisma.terminologyRelease.findFirst({
    where: { status: 'ACTIVE' },
  });
  if (!release) {
    release = await prisma.terminologyRelease.create({
      data: {
        releaseKey: `TERM-SEED-${new Date().toISOString().slice(0, 10)}`,
        status: 'ACTIVE',
        ccddVersion: 'seed-snapshot',
        ccddCanonicalUrl: 'http://terminology.hl7.org/CodeSystem/hc-CCDD',
        snomedVersion: 'http://snomed.info/sct',
        activatedAt: new Date(),
        validatedAt: new Date(),
        sourceMetadata: { seed: true },
      },
    });
    console.log('Created terminology release', release.releaseKey);
  } else {
    console.log('Using active terminology release', release.releaseKey);
  }

  for (const q of TERMINOLOGY_QUERIES) {
    const code = `local:${q.replace(/\s+/g, '-')}`;
    const existing = await prisma.terminologyDrugConcept.findFirst({
      where: {
        terminologyReleaseId: release.id,
        sourceSystem: 'safescribe-local',
        sourceCode: code,
      },
    });
    if (!existing) {
      await prisma.terminologyDrugConcept.create({
        data: {
          terminologyReleaseId: release.id,
          sourceSystem: 'safescribe-local',
          sourceCode: code,
          sourceVersion: '1',
          conceptKey: `local|safescribe|${code}`,
          conceptType: 'INGREDIENT',
          preferredNameEn: q,
          normalizedSearchName: q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
          isActive: true,
          rawSource: { seed: true, query: q },
        },
      });
    }
  }

  // Clavulin combination product → amoxicillin + clavulanic acid
  const amox = await prisma.terminologyDrugConcept.findFirst({
    where: { terminologyReleaseId: release.id, preferredNameEn: 'amoxicillin' },
  });
  const clav = await prisma.terminologyDrugConcept.findFirst({
    where: { terminologyReleaseId: release.id, preferredNameEn: 'clavulanic acid' },
  });
  let product = await prisma.terminologyDrugConcept.findFirst({
    where: {
      terminologyReleaseId: release.id,
      preferredNameEn: 'amoxicillin clavulanate',
    },
  });
  if (!product) {
    product = await prisma.terminologyDrugConcept.create({
      data: {
        terminologyReleaseId: release.id,
        sourceSystem: 'safescribe-local',
        sourceCode: 'local:amoxicillin-clavulanate',
        sourceVersion: '1',
        conceptKey: 'local|safescribe|local:amoxicillin-clavulanate',
        conceptType: 'CLINICAL_DRUG',
        preferredNameEn: 'amoxicillin clavulanate',
        brandName: 'Clavulin',
        normalizedSearchName: 'amoxicillin clavulanate',
        isActive: true,
        rawSource: { seed: true },
      },
    });
  }
  if (amox && product) {
    await prisma.terminologyIngredientEdge.upsert({
      where: {
        terminologyReleaseId_medicationId_ingredientId_relationshipType_ingredientRole: {
          terminologyReleaseId: release.id,
          medicationId: product.id,
          ingredientId: amox.id,
          relationshipType: 'HAS_ACTIVE_INGREDIENT',
          ingredientRole: 'ACTIVE',
        },
      },
      create: {
        terminologyReleaseId: release.id,
        medicationId: product.id,
        ingredientId: amox.id,
        relationshipType: 'HAS_ACTIVE_INGREDIENT',
        ingredientRole: 'ACTIVE',
        provenanceSource: 'seed',
        provenanceVersion: '1',
        derivationMethod: 'SEED',
        isActive: true,
        rawSource: {},
      },
      update: { isActive: true },
    });
  }
  if (clav && product) {
    await prisma.terminologyIngredientEdge.upsert({
      where: {
        terminologyReleaseId_medicationId_ingredientId_relationshipType_ingredientRole: {
          terminologyReleaseId: release.id,
          medicationId: product.id,
          ingredientId: clav.id,
          relationshipType: 'HAS_ACTIVE_INGREDIENT',
          ingredientRole: 'ACTIVE',
        },
      },
      create: {
        terminologyReleaseId: release.id,
        medicationId: product.id,
        ingredientId: clav.id,
        relationshipType: 'HAS_ACTIVE_INGREDIENT',
        ingredientRole: 'ACTIVE',
        provenanceSource: 'seed',
        provenanceVersion: '1',
        derivationMethod: 'SEED',
        isActive: true,
        rawSource: {},
      },
      update: { isActive: true },
    });
  }

  // Also ensure MedicationIngredient legacy table for combination allergy path
  await prisma.medicationIngredient.upsert({
    where: { productName: 'Clavulin 875 mg / 125 mg tablet' },
    create: {
      productName: 'Clavulin 875 mg / 125 mg tablet',
      genericName: 'amoxicillin-clavulanate',
      ingredients: ['amoxicillin', 'clavulanic acid'],
    },
    update: {
      ingredients: ['amoxicillin', 'clavulanic acid'],
    },
  });

  console.log('Terminology seed complete.');
  console.log(
    'Import the 12 workbooks via Super Admin → Safety Alert → Clinical Repository (12 files):',
  );
  for (const f of FILE_ORDER) {
    const full = path.join(SAMPLE_DIR, f);
    const exists = fs.existsSync(full);
    const sha = exists
      ? createHash('sha256').update(fs.readFileSync(full)).digest('hex').slice(0, 12)
      : 'MISSING';
    console.log(`  ${exists ? '✓' : '✗'} ${f}  sha256=${sha}…`);
  }
  console.log('\nThen: Approve drafts → Publish release (preflight + tests).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
