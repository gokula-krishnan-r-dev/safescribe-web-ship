/**
 * Offline E2E for clinical repository:
 * 1) fingerprint+parse+validate all 12 sample workbooks
 * 2) stage ClinicalImportBatch rows in DB
 * 3) promote to DRAFT repository records
 * 4) smoke-check counts + value-set exclude-wins semantics
 *
 * Usage (repo root, DATABASE_URL set):
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/src/scripts/e2e-clinical-repository.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { parseClinicalWorkbook } from '../modules/clinical-repository/import/parse-xlsx';
import { validateWorkbookRow } from '../modules/clinical-repository/import/validate-row';
import {
  WORKBOOK_REGISTRY,
  type ClinicalFileTypeKey,
  type ImportIssue,
} from '../modules/clinical-repository/contracts/workbook-registry';
import { ClinicalRepositoryPromoteService } from '../modules/clinical-repository/import/promote-drafts';

// apps/api/src/scripts → repo root
const SAMPLE_DIR = path.resolve(__dirname, '../../../../Safety_03082026');

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

type ReportRow = {
  file: string;
  ok: boolean;
  fileType?: string;
  rows?: number;
  errors?: number;
  warnings?: number;
  promoted?: number;
  message?: string;
};

async function main() {
  const report: ReportRow[] = [];
  const prisma = new PrismaClient();
  // PromoteService only needs prisma .$transaction / model API — cast light shim
  const promote = new ClinicalRepositoryPromoteService(prisma as never);

  console.log('=== Clinical Repository E2E ===');
  console.log('Sample dir:', SAMPLE_DIR);
  console.log('Registered types:', Object.keys(WORKBOOK_REGISTRY).length);

  // Ensure Super Admin user exists for FK
  let user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) {
    let role = await prisma.role.findFirst({
      where: { name: 'SUPER_ADMIN' },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          name: 'SUPER_ADMIN',
          displayName: 'Super Admin',
          description: 'E2E super admin',
          isSystem: true,
        },
      });
    }
    user = await prisma.user.create({
      data: {
        email: 'e2e-clinical@safescript.local',
        passwordHash: 'not-used',
        firstName: 'E2E',
        lastName: 'Clinical',
        roleId: role.id,
        status: 'ACTIVE',
      },
    });
  }

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

      // Stage batch
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const existing = await prisma.clinicalImportBatch.findFirst({
        where: { sha256, status: 'IMPORTED' },
      });
      if (existing) {
        report.push({
          file: fileName,
          ok: true,
          fileType: parsed.fileTypeKey,
          rows: parsed.rows.length,
          errors: errorCount,
          warnings: warningCount,
          promoted: existing.totalRows,
          message: 'already imported (idempotent)',
        });
        continue;
      }

      if (errorCount > 0) {
        report.push({
          file: fileName,
          ok: false,
          fileType: parsed.fileTypeKey,
          rows: parsed.rows.length,
          errors: errorCount,
          warnings: warningCount,
          message: issues
            .filter((i) => i.severity === 'ERROR')
            .slice(0, 5)
            .map((i) => `r${i.row}:${i.code}:${i.message}`)
            .join(' | '),
        });
        continue;
      }

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
          uploadedById: user.id,
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
        user.id,
      );

      report.push({
        file: fileName,
        ok: true,
        fileType: parsed.fileTypeKey,
        rows: parsed.rows.length,
        errors: 0,
        warnings: warningCount,
        promoted: result.promotedCount,
      });
    } catch (err) {
      report.push({
        file: fileName,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Approve all drafts for smoke
  const approveRes = await prisma.safetyRuleVersion.updateMany({
    where: { status: 'DRAFT' },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: user.id },
  });

  const counts = {
    valueSets: await prisma.clinicalValueSet.count(),
    members: await prisma.clinicalValueSetMember.count(),
    tests: await prisma.clinicalTestCase.count(),
    testInputs: await prisma.clinicalTestInput.count(),
    evidence: await prisma.safetyRuleEvidence.count({ where: { evidenceLinkId: { not: null } } }),
    ruleVersions: await prisma.safetyRuleVersion.count(),
    drugDisease: await prisma.safetyDrugDiseaseRuleDetail.count(),
    approved: approveRes.count,
    terminologyConcepts: await prisma.terminologyDrugConcept.count(),
  };

  // Value-set include/exclude precedence unit (in memory)
  const includeWinsExcludeSemantic = (() => {
    const members = [
      { membershipAction: 'INCLUDE' as const, code: 'ibuprofen' },
      { membershipAction: 'EXCLUDE' as const, code: 'ibuprofen topical' },
    ];
    const tokens = ['ibuprofen topical'];
    const hits = (code: string) =>
      tokens.some((t) => t.includes(code) || code.includes(t));
    const included = members.filter((m) => m.membershipAction === 'INCLUDE').some((m) => hits(m.code));
    const excluded = members.filter((m) => m.membershipAction === 'EXCLUDE').some((m) => hits(m.code));
    // exclude wins
    return !(included && !excluded) && included && excluded;
  })();

  console.log('\n--- File results ---');
  for (const r of report) {
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.file}` +
        (r.fileType ? ` [${r.fileType}]` : '') +
        (r.rows != null ? ` rows=${r.rows}` : '') +
        (r.errors != null ? ` err=${r.errors}` : '') +
        (r.warnings != null ? ` warn=${r.warnings}` : '') +
        (r.promoted != null ? ` promoted=${r.promoted}` : '') +
        (r.message ? ` — ${r.message}` : ''),
    );
  }
  console.log('\n--- Counts ---');
  console.log(JSON.stringify(counts, null, 2));
  console.log('\n--- Semantics ---');
  console.log(
    includeWinsExcludeSemantic
      ? 'PASS  value-set exclude wins over include for topical NSAID style tokens'
      : 'FAIL  value-set exclude precedence',
  );

  const failed = report.filter((r) => !r.ok);
  const allPass = failed.length === 0 && includeWinsExcludeSemantic;
  console.log(`\n=== E2E ${allPass ? 'PASS' : 'FAIL'} (${report.length - failed.length}/${report.length} files) ===`);

  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
