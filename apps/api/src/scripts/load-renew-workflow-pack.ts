/**
 * Load the governed Renew workflow workbooks into live configuration tables.
 *
 * Source of truth (in order):
 *   1. renew-workflow/*.xlsx
 *   2. repo-root renew-*.xlsx
 *
 * Promote order is required: input definitions first, then indications,
 * conditional questions, then monitoring rules (which reference input_code).
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '@prisma/client';
import { parseClinicalWorkbook } from '../modules/clinical-repository/import/parse-xlsx';
import { validateWorkbookRow } from '../modules/clinical-repository/import/validate-row';
import { promoteRenewWorkflowRow } from '../modules/clinical-repository/import/promote-renew';
import type { ClinicalFileTypeKey, ImportIssue } from '../modules/clinical-repository/contracts/workbook-registry';

export const RENEW_WORKFLOW_FILES = [
  'renew-input-definitions.xlsx',
  'renew-medication-indications.xlsx',
  'renew-conditional-questions.xlsx',
  'renew-monitoring-rules.xlsx',
] as const;

export type RenewWorkflowImportReport = {
  file: string;
  ok: boolean;
  skipped?: boolean;
  fileType?: string;
  rows?: number;
  promoted?: number;
  message?: string;
};

function repoRoot() {
  return path.resolve(__dirname, '../../../../');
}

export function resolveRenewWorkflowDir() {
  const root = repoRoot();
  const pack = path.join(root, 'renew-workflow');
  if (RENEW_WORKFLOW_FILES.every((file) => fs.existsSync(path.join(pack, file)))) {
    return pack;
  }
  return root;
}

function existingWorkbookPath(dir: string, fileName: string) {
  const canonical = path.join(dir, fileName);
  if (fs.existsSync(canonical)) return canonical;
  const numbered = path.join(dir, fileName.replace(/\.xlsx$/i, ' (1).xlsx'));
  if (fs.existsSync(numbered)) return numbered;
  return null;
}

async function resolveUploaderId(prisma: PrismaClient, preferredUserId?: string) {
  if (preferredUserId) {
    const preferred = await prisma.user.findUnique({ where: { id: preferredUserId }, select: { id: true } });
    if (preferred) return preferred.id;
  }
  const superAdmin = await prisma.user.findFirst({
    where: { role: { name: 'SUPER_ADMIN' }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (superAdmin) return superAdmin.id;
  const anyUser = await prisma.user.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!anyUser) {
    throw new Error('No user found to own Renew workflow imports. Seed users first.');
  }
  return anyUser.id;
}

export async function loadRenewWorkflowPack(
  prisma: PrismaClient,
  opts: { userId?: string; force?: boolean } = {},
): Promise<RenewWorkflowImportReport[]> {
  const dir = resolveRenewWorkflowDir();
  const userId = await resolveUploaderId(prisma, opts.userId);
  const report: RenewWorkflowImportReport[] = [];

  console.log('Renew workflow pack:', dir);

  if (opts.force) {
    await prisma.renewMonitoringRule.deleteMany();
    await prisma.renewConditionalQuestion.deleteMany();
    await prisma.renewMedicationIndicationMap.deleteMany();
    await prisma.renewConditionAlias.deleteMany();
    await prisma.renewCondition.deleteMany();
    await prisma.renewMonitoringInput.deleteMany();
  }

  for (const fileName of RENEW_WORKFLOW_FILES) {
    const full = existingWorkbookPath(dir, fileName);
    if (!full) {
      report.push({ file: fileName, ok: false, message: 'FILE_MISSING' });
      continue;
    }

    try {
      const buffer = fs.readFileSync(full);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const already = await prisma.clinicalImportBatch.findFirst({
        where: { sha256, fileTypeKey: { startsWith: 'renew_' }, status: 'IMPORTED' },
        orderBy: { importedAt: 'desc' },
        select: { id: true, status: true, originalFilename: true, totalRows: true },
      });
      if (already && !opts.force) {
        report.push({
          file: fileName,
          ok: true,
          skipped: true,
          rows: already.totalRows,
          message: `already ${already.status.toLowerCase()} (${already.originalFilename})`,
        });
        continue;
      }

      const parsed = parseClinicalWorkbook(buffer, fileName);
      const issues: ImportIssue[] = [...parsed.issues];
      for (const row of parsed.rows) {
        issues.push(...validateWorkbookRow(parsed.fileTypeKey, row.sourceRowNumber, row.raw));
      }
      const errors = issues.filter((issue) => issue.severity === 'ERROR');
      if (errors.length) {
        report.push({
          file: fileName,
          ok: false,
          fileType: parsed.fileTypeKey,
          rows: parsed.rows.length,
          message: errors
            .slice(0, 6)
            .map((issue) => `r${issue.row}:${issue.code}:${issue.message}`)
            .join(' | '),
        });
        continue;
      }

      const warningCount = issues.filter((issue) => issue.severity === 'WARNING').length;
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

      let promoted = 0;
      await prisma.$transaction(
        async (tx) => {
          const rows = await tx.clinicalImportRow.findMany({
            where: { importBatchId: batch.id },
            orderBy: { sourceRowNumber: 'asc' },
          });
          for (const row of rows) {
            const raw = row.rawPayload as Record<string, unknown>;
            await promoteRenewWorkflowRow(tx, parsed.fileTypeKey as ClinicalFileTypeKey, raw, batch.id);
            await tx.clinicalImportRow.update({
              where: { id: row.id },
              data: { rowStatus: 'IMPORTED' },
            });
            promoted += 1;
          }
          await tx.clinicalImportBatch.update({
            where: { id: batch.id },
            data: {
              status: 'IMPORTED',
              importedAt: new Date(),
              importedById: userId,
            },
          });
        },
        { timeout: 120_000, maxWait: 15_000 },
      );

      report.push({
        file: fileName,
        ok: true,
        fileType: parsed.fileTypeKey,
        rows: parsed.rows.length,
        promoted,
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

  const failed = report.filter((row) => !row.ok);
  if (!failed.length) {
    await retireUngovernedStarterRows(prisma);
    await publishRenewConfigRelease(prisma, userId);
  }

  return report;
}

async function retireUngovernedStarterRows(prisma: PrismaClient) {
  await prisma.renewMonitoringRule.updateMany({
    where: { sourceBatchId: null, active: true },
    data: { active: false },
  });
  await prisma.renewConditionalQuestion.updateMany({
    where: { sourceBatchId: null, active: true },
    data: { active: false },
  });
  await prisma.renewMedicationIndicationMap.updateMany({
    where: { sourceBatchId: null, active: true },
    data: { active: false },
  });
  await prisma.renewMonitoringInput.updateMany({
    where: { sourceBatchId: null, active: true },
    data: { active: false },
  });
}

async function publishRenewConfigRelease(prisma: PrismaClient, publishedById: string) {
  const [inputs, monitoringRules, indicationMaps, questions] = await Promise.all([
    prisma.renewMonitoringInput.count({ where: { active: true, sourceBatchId: { not: null } } }),
    prisma.renewMonitoringRule.count({ where: { active: true, sourceBatchId: { not: null } } }),
    prisma.renewMedicationIndicationMap.count({
      where: { active: true, sourceBatchId: { not: null } },
    }),
    prisma.renewConditionalQuestion.count({ where: { active: true, sourceBatchId: { not: null } } }),
  ]);
  await prisma.renewConfigRelease.upsert({
    where: { releaseCode: 'RENEW-WORKFLOW-PACK' },
    update: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      publishedById,
      notes: JSON.stringify({ inputs, monitoringRules, indicationMaps, questions }),
    },
    create: {
      releaseCode: 'RENEW-WORKFLOW-PACK',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      publishedById,
      notes: JSON.stringify({ inputs, monitoringRules, indicationMaps, questions }),
    },
  });
}

export function printRenewWorkflowReport(report: RenewWorkflowImportReport[]) {
  for (const row of report) {
    const status = !row.ok ? 'FAIL' : row.skipped ? 'SKIP' : 'PASS';
    console.log(
      `${status}  ${row.file}` +
        (row.fileType ? ` [${row.fileType}]` : '') +
        (row.rows != null ? ` rows=${row.rows}` : '') +
        (row.promoted != null ? ` promoted=${row.promoted}` : '') +
        (row.message ? ` — ${row.message}` : ''),
    );
  }
}
