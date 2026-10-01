/**
 * Seed governed Renew workflow configuration from the renew-workflow workbook pack.
 *
 * Usage (repo root, DATABASE_URL set):
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/src/scripts/seed-renew-workflow.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loadRenewWorkflowPack, printRenewWorkflowReport } from './load-renew-workflow-pack';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('=== SafeScribe Renew workflow seed ===');
    const force = process.argv.includes('--force');
    const report = await loadRenewWorkflowPack(prisma, { force });
    printRenewWorkflowReport(report);
    const failed = report.filter((row) => !row.ok);
    if (failed.length) {
      throw new Error(`${failed.length} Renew workbook(s) failed to import.`);
    }
    const counts = {
      inputs: await prisma.renewMonitoringInput.count({ where: { active: true } }),
      monitoringRules: await prisma.renewMonitoringRule.count({ where: { active: true } }),
      indicationMaps: await prisma.renewMedicationIndicationMap.count({ where: { active: true } }),
      conditions: await prisma.renewCondition.count({ where: { active: true } }),
      questions: await prisma.renewConditionalQuestion.count({ where: { active: true } }),
      configRelease: await prisma.renewConfigRelease.findFirst({
        where: { status: 'PUBLISHED' },
        select: { releaseCode: true, publishedAt: true },
      }),
    };
    console.log('\n=== Live Renew configuration counts ===');
    console.log(JSON.stringify(counts, null, 2));
    console.log('=== DONE ===');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
