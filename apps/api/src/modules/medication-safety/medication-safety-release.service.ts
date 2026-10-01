import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { Request } from 'express';
import { MedicationSafetyCacheService } from './medication-safety-cache.service';
import { MedicationSafetyEvaluatorService } from './medication-safety-evaluator.service';
import { SAFETY_ALERT_LABEL } from '@safescript/shared';
import { SAFETY_ENGINE_VERSION } from './medication-safety.types';

const RELEASE_ITEM_CHUNK = 250;
const PUBLISH_TX_TIMEOUT_MS = 120_000;
const PUBLISH_TX_MAX_WAIT_MS = 20_000;

@Injectable()
export class MedicationSafetyReleaseService {
  private readonly logger = new Logger(MedicationSafetyReleaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: MedicationSafetyCacheService,
    private readonly evaluator: MedicationSafetyEvaluatorService,
    private readonly audit: AuditService,
  ) {}

  async getCurrent() {
    const pointer = await this.prisma.safetyReleasePointer.findUnique({
      where: { id: 'singleton' },
      include: {
        release: {
          include: {
            publishedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            _count: { select: { items: true } },
          },
        },
      },
    });

    const cacheMeta = await this.cache.getMeta();
    const cacheReady = await this.cache.isReady();

    return {
      active: pointer?.release
        ? {
            id: pointer.release.id,
            version: pointer.release.version,
            checksum: pointer.release.checksum,
            engineVersion: pointer.release.engineVersion,
            ruleCount: pointer.release._count.items,
            publishedAt: pointer.release.publishedAt,
            publishedBy: pointer.release.publishedBy,
          }
        : null,
      cache: { ready: cacheReady, meta: cacheMeta },
    };
  }

  /**
   * Paginated immutable knowledge-release history (newest first).
   * Active = currently pointed to by SafetyReleasePointer.
   */
  async list(params: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const pointer = await this.prisma.safetyReleasePointer.findUnique({
      where: { id: 'singleton' },
      select: { releaseId: true },
    });
    const activeId = pointer?.releaseId ?? null;

    const [total, rows] = await Promise.all([
      this.prisma.safetyKnowledgeRelease.count(),
      this.prisma.safetyKnowledgeRelease.findMany({
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
        include: {
          publishedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          priorRelease: { select: { id: true, version: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        version: r.version,
        checksum: r.checksum,
        engineVersion: r.engineVersion,
        releaseNotes: r.releaseNotes,
        ruleCount: r._count.items,
        publishedAt: r.publishedAt,
        publishedBy: r.publishedBy,
        priorRelease: r.priorRelease,
        isActive: r.id === activeId,
        canRestore: r.id !== activeId,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        activeReleaseId: activeId,
      },
    };
  }

  /**
   * Reactivate an immutable prior release (rollback).
   * Never deletes or rewrites history — only moves the active pointer + rebuilds cache.
   */
  async restore(
    releaseId: string,
    user: RequestUser,
    req: Request,
    opts: { reason?: string } = {},
  ) {
    const target = await this.prisma.safetyKnowledgeRelease.findUnique({
      where: { id: releaseId },
      include: {
        _count: { select: { items: true } },
        publishedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!target) {
      throw new NotFoundException('Release not found');
    }
    if (target._count.items === 0) {
      throw new BadRequestException(
        'Cannot restore an empty release (no rule versions linked)',
      );
    }

    const pointer = await this.prisma.safetyReleasePointer.findUnique({
      where: { id: 'singleton' },
      include: {
        release: { select: { id: true, version: true } },
      },
    });

    if (pointer?.releaseId === target.id) {
      throw new BadRequestException(
        `${target.version} is already the active release`,
      );
    }

    const previous = pointer?.release
      ? { id: pointer.release.id, version: pointer.release.version }
      : null;

    await this.prisma.safetyReleasePointer.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', releaseId: target.id },
      update: { releaseId: target.id },
    });

    await this.cache.rebuildFromRelease(target.id);
    await this.runGoldenTests();

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'RESTORE',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      previousValue: previous ?? undefined,
      newValue: {
        releaseId: target.id,
        version: target.version,
        ruleCount: target._count.items,
        reason: opts.reason?.trim() || null,
      },
    });

    return {
      restored: {
        id: target.id,
        version: target.version,
        ruleCount: target._count.items,
        publishedAt: target.publishedAt,
        publishedBy: target.publishedBy,
      },
      previous,
      message: `Restored active ${SAFETY_ALERT_LABEL} to ${target.version}`,
    };
  }

  async publish(
    user: RequestUser,
    req: Request,
    opts: { releaseNotes?: string } = {},
  ) {
    const toPublish = await this.prisma.safetyRuleVersion.findMany({
      where: { status: 'APPROVED' },
      select: { id: true },
    });

    if (!toPublish.length) {
      throw new BadRequestException(
        'No approved rules to publish. Approve draft rules before publishing.',
      );
    }

    this.logger.log(`Publishing ${toPublish.length} approved rule version(s)`);
    await this.ensureGoldenTestIngredients();

    const priorPointer = await this.prisma.safetyReleasePointer.findUnique({
      where: { id: 'singleton' },
    });

    const versionLabel = `KR-${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}.${Date.now() % 1000}`;
    const checksum = createHash('sha256')
      .update(toPublish.map((v) => v.id).sort().join(','))
      .digest('hex');

    const publishedAt = new Date();
    const release = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.safetyKnowledgeRelease.create({
          data: {
            version: versionLabel,
            checksum,
            engineVersion: SAFETY_ENGINE_VERSION,
            publishedById: user.id,
            priorReleaseId: priorPointer?.releaseId ?? null,
            releaseNotes: opts.releaseNotes?.trim() || null,
          },
        });

        for (let i = 0; i < toPublish.length; i += RELEASE_ITEM_CHUNK) {
          const slice = toPublish.slice(i, i + RELEASE_ITEM_CHUNK);
          await tx.safetyReleaseItem.createMany({
            data: slice.map((v) => ({ releaseId: created.id, versionId: v.id })),
          });
          await tx.safetyRuleVersion.updateMany({
            where: { id: { in: slice.map((v) => v.id) } },
            data: { status: 'PUBLISHED', publishedAt },
          });
        }

        await tx.safetyReleasePointer.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', releaseId: created.id },
          update: { releaseId: created.id },
        });

        return created;
      },
      { timeout: PUBLISH_TX_TIMEOUT_MS, maxWait: PUBLISH_TX_MAX_WAIT_MS },
    );

    this.logger.log(`Release ${release.version} written; rebuilding runtime cache`);
    await this.cache.rebuildFromRelease(release.id);
    await this.runGoldenTests();

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'PUBLISH',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: {
        releaseId: release.id,
        version: release.version,
        ruleCount: toPublish.length,
        releaseNotes: opts.releaseNotes?.trim() || null,
      },
    });

    return { release: { id: release.id, version: release.version, ruleCount: toPublish.length } };
  }

  private async ensureGoldenTestIngredients() {
    await this.prisma.medicationIngredient.upsert({
      where: { productName: 'Clavulin 875 mg / 125 mg tablet' },
      create: {
        productName: 'Clavulin 875 mg / 125 mg tablet',
        genericName: 'amoxicillin-clavulanate',
        ingredients: ['amoxicillin', 'clavulanic acid'],
      },
      update: {},
    });
  }

  private async runGoldenTests() {
    const result = await this.evaluator.evaluate({
      patientContext: {
        allergies: [{ substance: 'amoxicillin', clinicalStatus: 'active', verificationStatus: 'confirmed' }],
      },
      selectedMedications: [{ productName: 'Clavulin 875 mg / 125 mg tablet' }],
    });

    if (result.status === 'SERVICE_UNAVAILABLE') {
      throw new BadRequestException('Golden test failed: evaluator service unavailable after publish');
    }

    const hasComboFinding = result.findings.some(
      (f) =>
        f.matchType === 'combination_product_contains_exact_ingredient' ||
        f.matchType === 'exact_ingredient',
    );
    if (!hasComboFinding) {
      throw new BadRequestException(
        'Golden test failed: amoxicillin allergy + Clavulin must produce an ingredient alert',
      );
    }
  }
}
