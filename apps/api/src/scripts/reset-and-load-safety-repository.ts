/**
 * Reset Safety Engine / Clinical Repository data and reload from Safety_03082026/.
 *
 * Clears governed safety tables, re-seeds terminology + ingredient helpers,
 * imports+promotes all 12 sample workbooks, approves drafts, and publishes a
 * knowledge release (Redis cache warms on next API restart).
 *
 * Usage (repo root, DATABASE_URL set):
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/src/scripts/reset-and-load-safety-repository.ts
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { parseClinicalWorkbook } from '../modules/clinical-repository/import/parse-xlsx';
import { validateWorkbookRow } from '../modules/clinical-repository/import/validate-row';
import {
  type ClinicalFileTypeKey,
  type ImportIssue,
} from '../modules/clinical-repository/contracts/workbook-registry';
import { ClinicalRepositoryPromoteService } from '../modules/clinical-repository/import/promote-drafts';
import { loadRenewWorkflowPack, printRenewWorkflowReport } from './load-renew-workflow-pack';

const SAMPLE_DIR = path.resolve(__dirname, '../../../../Safety_03082026');
const ENGINE_VERSION = 'safety-engine-1.4.0';

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
] as const;

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
  'azithromycin',
  'amiodarone',
  'isotretinoin',
  'ramipril',
  'tramadol',
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

const DEFAULT_DRUG_CATALOG = [
  { drugName: 'amoxicillin', className: 'penicillin', ingredient: 'amoxicillin', commonBrands: ['amoxil'] },
  { drugName: 'azithromycin', className: 'macrolide', ingredient: 'azithromycin', commonBrands: ['zithromax'] },
  { drugName: 'metformin', className: 'biguanide', ingredient: 'metformin', commonBrands: [] },
  { drugName: 'ibuprofen', className: 'nsaid', ingredient: 'ibuprofen', commonBrands: ['advil'] },
  { drugName: 'ramipril', className: 'ace inhibitor', ingredient: 'ramipril', commonBrands: ['altace'] },
  { drugName: 'propranolol', className: 'beta blocker', ingredient: 'propranolol', commonBrands: [] },
  { drugName: 'sildenafil', className: 'pde5 inhibitor', ingredient: 'sildenafil', commonBrands: ['viagra'] },
  { drugName: 'warfarin', className: 'vka', ingredient: 'warfarin', commonBrands: ['coumadin'] },
  { drugName: 'codeine', className: 'opioid', ingredient: 'codeine', commonBrands: [] },
];

async function clearSafetyEngineData(prisma: PrismaClient) {
  console.log('\n=== Clearing Safety Engine / Clinical Repository data ===');

  // Consultation safety evaluations first
  await prisma.safetyEvaluationOverride.deleteMany();
  await prisma.safetyEvaluationFinding.deleteMany();
  await prisma.safetyEvaluation.deleteMany();

  // Releases
  await prisma.safetyReleaseItem.deleteMany();
  await prisma.safetyReleasePointer.deleteMany();
  await prisma.safetyKnowledgeRelease.deleteMany();

  // Rule version details + versions + rules
  await prisma.safetyLabRuleDetail.deleteMany();
  await prisma.safetyDdiRuleDetail.deleteMany();
  await prisma.safetyDrugDiseaseRuleDetail.deleteMany();
  await prisma.safetyPregnancyRuleDetail.deleteMany();
  await prisma.safetyLactationRuleDetail.deleteMany();
  await prisma.safetyRenalRuleDetail.deleteMany();
  await prisma.safetyRuleParticipant.deleteMany();
  await prisma.safetyRuleEvidence.deleteMany();
  await prisma.safetyRuleVersion.deleteMany();
  await prisma.safetyKnowledgeRule.deleteMany();

  // Import staging + promoted clinical repo
  await prisma.clinicalImportRow.deleteMany();
  await prisma.clinicalImportBatch.deleteMany();
  await prisma.clinicalTestCase.deleteMany();
  await prisma.clinicalTestInput.deleteMany();
  await prisma.clinicalValueSetMember.deleteMany();
  await prisma.clinicalValueSet.deleteMany();

  // Terminology
  await prisma.terminologyIngredientEdge.deleteMany();
  await prisma.terminologyDrugConcept.deleteMany();
  await prisma.terminologyRelease.deleteMany();

  // Helper catalogs used by consultation matching
  await prisma.medicationIngredient.deleteMany();
  await prisma.drugClassMembership.deleteMany();
  await prisma.drugCatalog.deleteMany();
  await prisma.drugClassTaxonomy.deleteMany();

  // Governed Renew workflow configuration (collection rules, not safety thresholds)
  await prisma.renewMonitoringRule.deleteMany();
  await prisma.renewConditionalQuestion.deleteMany();
  await prisma.renewMedicationIndicationMap.deleteMany();
  await prisma.renewConditionAlias.deleteMany();
  await prisma.renewCondition.deleteMany();
  await prisma.renewMonitoringInput.deleteMany();
  await prisma.renewConfigRelease.deleteMany();

  console.log('Cleared.');
}

async function seedTerminologyAndHelpers(prisma: PrismaClient) {
  console.log('\n=== Seeding terminology + product helpers ===');
  const release = await prisma.terminologyRelease.create({
    data: {
      releaseKey: `TERM-SEED-${new Date().toISOString().slice(0, 10)}`,
      status: 'ACTIVE',
      ccddVersion: 'seed-snapshot',
      ccddCanonicalUrl: 'http://terminology.hl7.org/CodeSystem/hc-CCDD',
      snomedVersion: 'http://snomed.info/sct',
      activatedAt: new Date(),
      validatedAt: new Date(),
      sourceMetadata: { seed: true, source: 'reset-and-load-safety-repository' },
    },
  });

  for (const q of TERMINOLOGY_QUERIES) {
    const code = `local:${q.replace(/\s+/g, '-')}`;
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

  const amox = await prisma.terminologyDrugConcept.findFirst({
    where: { terminologyReleaseId: release.id, preferredNameEn: 'amoxicillin' },
  });
  const clav = await prisma.terminologyDrugConcept.findFirst({
    where: { terminologyReleaseId: release.id, preferredNameEn: 'clavulanic acid' },
  });
  const product = await prisma.terminologyDrugConcept.create({
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

  for (const ingredient of [amox, clav]) {
    if (!ingredient) continue;
    await prisma.terminologyIngredientEdge.create({
      data: {
        terminologyReleaseId: release.id,
        medicationId: product.id,
        ingredientId: ingredient.id,
        relationshipType: 'HAS_ACTIVE_INGREDIENT',
        ingredientRole: 'ACTIVE',
        provenanceSource: 'seed',
        provenanceVersion: '1',
        derivationMethod: 'SEED',
        isActive: true,
        rawSource: {},
      },
    });
  }

  for (const row of DEFAULT_INGREDIENTS) {
    await prisma.medicationIngredient.create({ data: row });
  }
  for (const row of DEFAULT_DRUG_CATALOG) {
    await prisma.drugCatalog.create({
      data: {
        drugName: row.drugName,
        className: row.className,
        ingredient: row.ingredient,
        commonBrands: row.commonBrands,
      },
    });
  }

  console.log(`Terminology ${release.releaseKey} active with ${TERMINOLOGY_QUERIES.length} concepts.`);
  return release;
}

async function importAndPromoteAll(
  prisma: PrismaClient,
  promote: ClinicalRepositoryPromoteService,
  userId: string,
) {
  console.log('\n=== Import + promote Safety_03082026 workbooks ===');
  console.log('Sample dir:', SAMPLE_DIR);

  const report: Array<{
    file: string;
    ok: boolean;
    fileType?: string;
    rows?: number;
    promoted?: number;
    message?: string;
  }> = [];

  for (const fileName of FILE_ORDER) {
    const full = path.join(SAMPLE_DIR, fileName);
    if (!fs.existsSync(full)) {
      report.push({ file: fileName, ok: false, message: 'FILE_MISSING' });
      continue;
    }

    try {
      const buffer = fs.readFileSync(full);
      const parsed = parseClinicalWorkbook(buffer, fileName);
      const issues: ImportIssue[] = [...parsed.issues];
      for (const row of parsed.rows) {
        issues.push(...validateWorkbookRow(parsed.fileTypeKey, row.sourceRowNumber, row.raw));
      }
      const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
      const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

      if (errorCount > 0) {
        report.push({
          file: fileName,
          ok: false,
          fileType: parsed.fileTypeKey,
          rows: parsed.rows.length,
          message: issues
            .filter((i) => i.severity === 'ERROR')
            .slice(0, 5)
            .map((i) => `r${i.row}:${i.code}:${i.message}`)
            .join(' | '),
        });
        continue;
      }

      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const batch = await prisma.clinicalImportBatch.create({
        data: {
          fileTypeKey: parsed.fileTypeKey,
          originalFilename: fileName,
          sha256,
          workbookSheetName: parsed.sheetName,
          headerFingerprint: parsed.headerFingerprint,
          schemaVersion: parsed.schemaVersion,
          status: 'READY_TO_IMPORT',
          jurisdiction: 'CA',
          uploadedById: userId,
          totalRows: parsed.rows.length,
          validRows: parsed.rows.length,
          warningRows: warningCount,
          errorRows: 0,
          failureSummary:
            warningCount > 0 ? `${warningCount} warning(s) — drafts still importable` : null,
        },
      });

      await prisma.clinicalImportRow.createMany({
        data: parsed.rows.map((row) => ({
          importBatchId: batch.id,
          sourceRowNumber: row.sourceRowNumber,
          businessKey: row.businessKey || null,
          rawPayload: row.raw as never,
          rowStatus: 'VALID',
          errors: [] as never,
          warnings: [] as never,
        })),
      });

      const result = await promote.promoteBatch(
        batch.id,
        parsed.fileTypeKey as ClinicalFileTypeKey,
        userId,
      );

      report.push({
        file: fileName,
        ok: true,
        fileType: parsed.fileTypeKey,
        rows: parsed.rows.length,
        promoted: result.promotedCount,
        message: warningCount ? `${warningCount} warning(s)` : undefined,
      });
    } catch (err) {
      report.push({
        file: fileName,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const r of report) {
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.file}` +
        (r.fileType ? ` [${r.fileType}]` : '') +
        (r.rows != null ? ` rows=${r.rows}` : '') +
        (r.promoted != null ? ` promoted=${r.promoted}` : '') +
        (r.message ? ` — ${r.message}` : ''),
    );
  }

  return report;
}

async function approveAndPublish(prisma: PrismaClient, userId: string) {
  console.log('\n=== Approve drafts + publish knowledge release ===');

  const approveRes = await prisma.safetyRuleVersion.updateMany({
    where: { status: 'DRAFT' },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId },
  });
  console.log(`Approved ${approveRes.count} draft rule version(s).`);

  const toPublish = await prisma.safetyRuleVersion.findMany({
    where: { status: 'APPROVED' },
  });
  if (!toPublish.length) {
    throw new Error('No approved rules to publish after promote.');
  }

  const versionLabel = `KR-${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}.1`;
  const checksum = createHash('sha256')
    .update(JSON.stringify(toPublish.map((v) => v.id).sort()))
    .digest('hex');

  const release = await prisma.$transaction(async (tx) => {
    const created = await tx.safetyKnowledgeRelease.create({
      data: {
        version: versionLabel,
        checksum,
        engineVersion: ENGINE_VERSION,
        publishedById: userId,
        items: { create: toPublish.map((v) => ({ versionId: v.id })) },
      },
    });

    await tx.safetyRuleVersion.updateMany({
      where: { id: { in: toPublish.map((v) => v.id) } },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    await tx.safetyReleasePointer.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', releaseId: created.id },
      update: { releaseId: created.id },
    });

    return created;
  });

  console.log(`Published ${release.version} with ${toPublish.length} rules.`);
  return release;
}

async function main() {
  if (!fs.existsSync(SAMPLE_DIR)) {
    throw new Error(`Sample directory missing: ${SAMPLE_DIR}`);
  }

  const prisma = new PrismaClient();
  const promote = new ClinicalRepositoryPromoteService(prisma as never);

  try {
    let user = await prisma.user.findFirst({
      where: { role: { name: 'SUPER_ADMIN' } },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) {
      user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    }
    if (!user) {
      throw new Error('No user found for FK ownership. Seed users first.');
    }

    await clearSafetyEngineData(prisma);
    await seedTerminologyAndHelpers(prisma);
    const report = await importAndPromoteAll(prisma, promote, user.id);
    const failed = report.filter((r) => !r.ok);
    if (failed.length) {
      throw new Error(`${failed.length} workbook(s) failed — aborting publish.`);
    }

    const release = await approveAndPublish(prisma, user.id);

    console.log('\n=== Import + promote Renew workflow workbooks ===');
    const renewReport = await loadRenewWorkflowPack(prisma, { userId: user.id, force: true });
    printRenewWorkflowReport(renewReport);
    const renewFailed = renewReport.filter((row) => !row.ok);
    if (renewFailed.length) {
      throw new Error(`${renewFailed.length} Renew workbook(s) failed.`);
    }

    const counts = {
      valueSets: await prisma.clinicalValueSet.count(),
      members: await prisma.clinicalValueSetMember.count(),
      evidence: await prisma.safetyRuleEvidence.count({ where: { evidenceLinkId: { not: null } } }),
      ruleVersions: await prisma.safetyRuleVersion.count(),
      publishedRules: await prisma.safetyRuleVersion.count({ where: { status: 'PUBLISHED' } }),
      testCases: await prisma.clinicalTestCase.count(),
      testInputs: await prisma.clinicalTestInput.count(),
      terminologyConcepts: await prisma.terminologyDrugConcept.count(),
      medicationIngredients: await prisma.medicationIngredient.count(),
      renewInputs: await prisma.renewMonitoringInput.count({ where: { active: true } }),
      renewMonitoringRules: await prisma.renewMonitoringRule.count({ where: { active: true } }),
      renewIndicationMaps: await prisma.renewMedicationIndicationMap.count({ where: { active: true } }),
      renewQuestions: await prisma.renewConditionalQuestion.count({ where: { active: true } }),
      renewConfigRelease: await prisma.renewConfigRelease.findFirst({
        where: { status: 'PUBLISHED' },
        select: { releaseCode: true },
      }),
      activeRelease: release.version,
    };

    console.log('\n=== Final counts ===');
    console.log(JSON.stringify(counts, null, 2));
    console.log('\nRestart the API (pm2) so Redis safety cache warms from the new release.');
    console.log('=== DONE ===');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
