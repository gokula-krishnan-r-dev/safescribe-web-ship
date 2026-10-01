/**
 * Seed governed Clinical Safety Reference & Target Values.
 *
 * Usage (repo root, DATABASE_URL set):
 *   pnpm db:seed:clinical-references
 *
 * Deploy uses this after migrate. It bootstraps an empty repository only and
 * never overwrites a published release.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loadClinicalReferencePack } from './load-clinical-reference-pack';

async function resolveUploaderId(prisma: PrismaClient) {
  const superAdmin = await prisma.user.findFirst({
    where: { role: { name: 'SUPER_ADMIN' }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (superAdmin) return superAdmin;
  const anyUser = await prisma.user.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!anyUser) {
    throw new Error('No user found to own the Reference Values bootstrap. Seed users first.');
  }
  return anyUser;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('=== SafeScribe Clinical Reference seed ===');
    const user = await resolveUploaderId(prisma);
    const report = await loadClinicalReferencePack(prisma, {
      userId: user.id,
      allowDraftReplacements: false,
    });
    console.log(JSON.stringify({ uploader: user.email, ...report }, null, 2));
    const counts = {
      values: await prisma.clinicalReferenceValue.count({ where: { status: 'PUBLISHED' } }),
      targets: await prisma.clinicalTreatmentTarget.count({ where: { status: 'PUBLISHED' } }),
      pediatric: await prisma.clinicalPediatricReferencePolicy.count({ where: { status: 'PUBLISHED' } }),
      sources: await prisma.clinicalReferenceSource.count({ where: { status: 'ACTIVE' } }),
      release: await prisma.clinicalReferencePointer.findUnique({
        where: { id: 'active' },
        include: { release: { select: { releaseId: true, publishedAt: true } } },
      }),
    };
    console.log('\n=== Live reference repository counts ===');
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
