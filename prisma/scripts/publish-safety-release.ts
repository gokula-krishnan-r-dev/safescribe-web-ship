/**
 * Approve all draft rules and publish initial safety release.
 * Run: npx tsx prisma/scripts/publish-safety-release.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();
const ENGINE_VERSION = 'safety-engine-1.4.0';

async function main() {
  const superAdmin = await prisma.user.findFirst({
    where: { role: { name: 'SUPER_ADMIN' } },
  });
  if (!superAdmin) {
    console.error('No super admin user found. Run db:seed first.');
    process.exit(1);
  }

  await prisma.safetyRuleVersion.updateMany({
    where: { status: 'DRAFT' },
    data: { status: 'APPROVED', approvedById: superAdmin.id, approvedAt: new Date() },
  });

  const toPublish = await prisma.safetyRuleVersion.findMany({
    where: { status: 'APPROVED' },
  });

  if (!toPublish.length) {
    console.log('No approved rules to publish.');
    return;
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
        publishedById: superAdmin.id,
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

  console.log(`Published ${release.version} with ${toPublish.length} rules. Restart API to warm Redis cache.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
