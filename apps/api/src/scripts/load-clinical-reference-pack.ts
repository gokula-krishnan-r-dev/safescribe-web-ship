/**
 * Idempotent load of the governed Reference Values Master into Clinical Safety tables.
 *
 * Deploy / seed: bootstrap a published release only when the repository is empty.
 * Admin Import may also create draft replacements for changed published records.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { CLINICAL_REFERENCE_MASTER } from '@safescript/shared';
import { inferSourceType, stringifyTarget, valueFingerprint } from '../modules/clinical-reference/clinical-reference.helpers';

export type ClinicalReferencePackReport = {
  bootstrap: boolean;
  skipped: boolean;
  message: string;
  created: {
    values: number;
    targets: number;
    pediatric: number;
    sources: number;
    skipped: number;
    drafts: number;
  };
  releaseId: string;
};

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadClinicalReferencePack(
  prisma: PrismaClient,
  options: {
    userId: string;
    /** When false (deploy/seed), never create drafts — only bootstrap an empty repo. */
    allowDraftReplacements: boolean;
  },
): Promise<ClinicalReferencePackReport> {
  const existingCount = await prisma.clinicalReferenceValue.count();
  if (existingCount > 0 && !options.allowDraftReplacements) {
    const pointer = await prisma.clinicalReferencePointer.findUnique({
      where: { id: 'active' },
      include: { release: { select: { releaseId: true } } },
    });
    return {
      bootstrap: false,
      skipped: true,
      message: `Reference repository already published (${pointer?.release.releaseId ?? 'existing records'}). Skipping deploy seed.`,
      created: { values: 0, targets: 0, pediatric: 0, sources: 0, skipped: 0, drafts: 0 },
      releaseId: pointer?.release.releaseId ?? CLINICAL_REFERENCE_MASTER.releaseId,
    };
  }

  const pack = CLINICAL_REFERENCE_MASTER;
  const bootstrap = existingCount === 0;
  const now = new Date();
  const userId = options.userId;

  const created = await prisma.$transaction(
    async (tx) => applyPack(tx, { bootstrap, now, userId, pack }),
    { timeout: 60_000 },
  );

  return {
    bootstrap,
    skipped: false,
    created,
    releaseId: pack.releaseId,
    message: bootstrap
      ? `Published ${pack.releaseId} from the governed Reference Values Master.`
      : created.drafts
        ? 'Existing published record found. Draft replacement created.'
        : 'No published records were overwritten. Import created drafts only where values changed.',
  };
}

async function applyPack(
  tx: Db,
  ctx: {
    bootstrap: boolean;
    now: Date;
    userId: string;
    pack: typeof CLINICAL_REFERENCE_MASTER;
  },
) {
  const { bootstrap, now, userId, pack } = ctx;
  const created = { values: 0, targets: 0, pediatric: 0, sources: 0, skipped: 0, drafts: 0 };
  let releaseId: string | null = null;

  if (bootstrap) {
    const release = await tx.clinicalReferenceRelease.create({
      data: {
        releaseId: pack.releaseId,
        versionLabel: pack.releaseId.replace('REFERENCE_RELEASE_', '').replaceAll('_', '-'),
        status: 'PUBLISHED',
        publishedAt: now,
        publishedById: userId,
        notes:
          'Bootstrap from governed Reference Values Master pack. Import never overwrites later published records.',
      },
    });
    releaseId = release.id;
    await tx.clinicalReferencePointer.create({
      data: { id: 'active', releaseId: release.id },
    });
  }

  for (const source of pack.sources) {
    const current = await tx.clinicalReferenceSource.findMany({
      where: { sourceCode: source.sourceCode },
      orderBy: { versionNumber: 'desc' },
    });
    const published = current.find((row) => row.status === 'ACTIVE');
    const open = current.find((row) => row.status === 'DRAFT' || row.status === 'IN_REVIEW');
    if (bootstrap) {
      await tx.clinicalReferenceSource.create({
        data: {
          sourceCode: source.sourceCode,
          versionNumber: 1,
          sourceName: source.sourceName,
          sourceType: inferSourceType(source.sourceCode),
          publisher: source.publisher,
          sourceUrl: source.sourceUrl,
          useCase: source.useCase,
          notes: source.notes,
          status: 'ACTIVE',
          lastReviewedAt: now,
          releaseId,
          createdById: userId,
          updatedById: userId,
        },
      });
      created.sources += 1;
      continue;
    }
    if (open) {
      created.skipped += 1;
      continue;
    }
    if (published && published.sourceName === source.sourceName && published.sourceUrl === source.sourceUrl) {
      created.skipped += 1;
      continue;
    }
    await tx.clinicalReferenceSource.create({
      data: {
        sourceCode: source.sourceCode,
        versionNumber: (current[0]?.versionNumber ?? 0) + 1,
        sourceName: source.sourceName,
        sourceType: inferSourceType(source.sourceCode),
        publisher: source.publisher,
        sourceUrl: source.sourceUrl,
        useCase: source.useCase,
        notes: source.notes,
        status: 'DRAFT',
        createdById: userId,
        updatedById: userId,
      },
    });
    created.drafts += 1;
    created.sources += 1;
  }

  for (const row of pack.references) {
    const current = await tx.clinicalReferenceValue.findMany({
      where: { referenceId: row.referenceId },
      orderBy: { versionNumber: 'desc' },
    });
    const payload = {
      referenceId: row.referenceId,
      inputCode: row.inputCode,
      label: row.label,
      category: row.category,
      population: row.population,
      sex: row.sex,
      context: row.context,
      referenceStrategy: row.strategy,
      referenceKind: row.kind,
      uiUse: row.uiUse,
      lowerNumeric: row.lowerNumeric,
      upperNumeric: row.upperNumeric,
      unit: row.unit,
      displayText: row.displayText,
      sourceCode: row.sourceCode,
      sourcePriority: row.sourcePriority,
      notes: row.notes,
    };
    if (bootstrap) {
      await tx.clinicalReferenceValue.create({
        data: {
          ...payload,
          versionNumber: 1,
          status: 'PUBLISHED',
          releaseId,
          createdById: userId,
          updatedById: userId,
        },
      });
      created.values += 1;
      continue;
    }
    const open = current.find((item) => item.status === 'DRAFT' || item.status === 'IN_REVIEW');
    const published = current.find((item) => item.status === 'PUBLISHED');
    if (open) {
      created.skipped += 1;
      continue;
    }
    if (published && valueFingerprint(published) === valueFingerprint(payload)) {
      created.skipped += 1;
      continue;
    }
    await tx.clinicalReferenceValue.create({
      data: {
        ...payload,
        versionNumber: (current[0]?.versionNumber ?? 0) + 1,
        status: 'DRAFT',
        createdById: userId,
        updatedById: userId,
      },
    });
    created.drafts += 1;
    created.values += 1;
  }

  for (const row of pack.targets) {
    const current = await tx.clinicalTreatmentTarget.findMany({
      where: { targetId: row.targetId },
      orderBy: { versionNumber: 'desc' },
    });
    const payload = {
      targetId: row.targetId,
      inputCode: row.inputCode,
      label: row.label,
      population: row.population,
      clinicalContext: row.clinicalContext,
      parameter: row.parameter,
      operator: row.operator,
      targetValue: stringifyTarget(row.targetValue),
      unit: row.unit,
      displayText: row.displayText,
      sourceCode: row.sourceCode,
      targetType: row.targetType,
      notes: row.notes,
    };
    if (bootstrap) {
      await tx.clinicalTreatmentTarget.create({
        data: {
          ...payload,
          versionNumber: 1,
          status: 'PUBLISHED',
          releaseId,
          createdById: userId,
          updatedById: userId,
        },
      });
      created.targets += 1;
      continue;
    }
    const open = current.find((item) => item.status === 'DRAFT' || item.status === 'IN_REVIEW');
    if (open) {
      created.skipped += 1;
      continue;
    }
    const published = current.find((item) => item.status === 'PUBLISHED');
    if (
      published &&
      published.displayText === payload.displayText &&
      published.sourceCode === payload.sourceCode &&
      published.targetValue === payload.targetValue
    ) {
      created.skipped += 1;
      continue;
    }
    await tx.clinicalTreatmentTarget.create({
      data: {
        ...payload,
        versionNumber: (current[0]?.versionNumber ?? 0) + 1,
        status: 'DRAFT',
        createdById: userId,
        updatedById: userId,
      },
    });
    created.drafts += 1;
    created.targets += 1;
  }

  for (const row of pack.pediatric) {
    const current = await tx.clinicalPediatricReferencePolicy.findMany({
      where: { inputCode: row.inputCode },
      orderBy: { versionNumber: 'desc' },
    });
    const payload = {
      inputCode: row.inputCode,
      label: row.label,
      category: row.category,
      strategy: row.strategy,
      preferredSource: row.preferredSource === 'NONE' ? null : row.preferredSource,
      fallbackAllowed: false,
      adultFallbackAllowed: false,
      implementationNote: row.implementationNote,
      sourceUrl: row.sourceUrl,
    };
    if (bootstrap) {
      await tx.clinicalPediatricReferencePolicy.create({
        data: {
          ...payload,
          versionNumber: 1,
          status: 'PUBLISHED',
          releaseId,
          createdById: userId,
          updatedById: userId,
        },
      });
      created.pediatric += 1;
      continue;
    }
    const open = current.find((item) => item.status === 'DRAFT' || item.status === 'IN_REVIEW');
    if (open) {
      created.skipped += 1;
      continue;
    }
    const published = current.find((item) => item.status === 'PUBLISHED');
    if (published && published.strategy === payload.strategy && published.preferredSource === payload.preferredSource) {
      created.skipped += 1;
      continue;
    }
    await tx.clinicalPediatricReferencePolicy.create({
      data: {
        ...payload,
        versionNumber: (current[0]?.versionNumber ?? 0) + 1,
        status: 'DRAFT',
        createdById: userId,
        updatedById: userId,
      },
    });
    created.drafts += 1;
    created.pediatric += 1;
  }

  return created;
}
