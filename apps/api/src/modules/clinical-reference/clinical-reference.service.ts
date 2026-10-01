import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalReferenceRecordStatus,
  ClinicalReferenceSourceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { loadClinicalReferencePack } from '@/scripts/load-clinical-reference-pack';
import {
  PatchPediatricPolicyDto,
  PatchReferenceSourceDto,
  PatchReferenceValueDto,
  PatchTreatmentTargetDto,
} from './clinical-reference.dto';
import {
  KNOWN_INPUT_CODES,
  matchesSearch,
  nextReleaseId,
  paginate,
  pickWorkingRecord,
  REFERENCE_AUDIT_MODULE,
  validatePublishSet,
} from './clinical-reference.helpers';

type Kind = 'value' | 'target' | 'pediatric' | 'source';

const RECORD_STATUSES = new Set<string>(Object.values(ClinicalReferenceRecordStatus));
const SOURCE_STATUSES = new Set<string>(Object.values(ClinicalReferenceSourceStatus));

@Injectable()
export class ClinicalReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async summary() {
    const [pointer, draftValues, draftTargets, draftPediatric, draftSources, inReview] =
      await Promise.all([
        this.prisma.clinicalReferencePointer.findUnique({
          where: { id: 'active' },
          include: { release: true },
        }),
        this.prisma.clinicalReferenceValue.count({ where: { status: 'DRAFT' } }),
        this.prisma.clinicalTreatmentTarget.count({ where: { status: 'DRAFT' } }),
        this.prisma.clinicalPediatricReferencePolicy.count({ where: { status: 'DRAFT' } }),
        this.prisma.clinicalReferenceSource.count({ where: { status: 'DRAFT' } }),
        Promise.all([
          this.prisma.clinicalReferenceValue.count({ where: { status: 'IN_REVIEW' } }),
          this.prisma.clinicalTreatmentTarget.count({ where: { status: 'IN_REVIEW' } }),
          this.prisma.clinicalPediatricReferencePolicy.count({ where: { status: 'IN_REVIEW' } }),
          this.prisma.clinicalReferenceSource.count({ where: { status: 'IN_REVIEW' } }),
        ]),
      ]);

    const draftChanges = draftValues + draftTargets + draftPediatric + draftSources;
    const inReviewChanges = inReview.reduce((sum, count) => sum + count, 0);

    return {
      publishedRelease: pointer?.release
        ? {
            id: pointer.release.id,
            releaseId: pointer.release.releaseId,
            versionLabel: pointer.release.versionLabel,
            status: pointer.release.status,
            publishedAt: pointer.release.publishedAt,
            notes: pointer.release.notes,
          }
        : null,
      draftChanges,
      inReviewChanges,
      counts: {
        values: await this.prisma.clinicalReferenceValue.count({ where: { status: 'PUBLISHED' } }),
        targets: await this.prisma.clinicalTreatmentTarget.count({ where: { status: 'PUBLISHED' } }),
        pediatric: await this.prisma.clinicalPediatricReferencePolicy.count({
          where: { status: 'PUBLISHED' },
        }),
        sources: await this.prisma.clinicalReferenceSource.count({ where: { status: 'ACTIVE' } }),
      },
    };
  }

  async listValues(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    population?: string;
    inputCode?: string;
  }) {
    const rows = await this.prisma.clinicalReferenceValue.findMany({
      where: {
        status: { notIn: ['SUPERSEDED', 'ARCHIVED'] },
        ...(query.inputCode ? { inputCode: query.inputCode } : {}),
        ...(query.population ? { population: query.population } : {}),
      },
      orderBy: [{ inputCode: 'asc' }, { versionNumber: 'desc' }],
    });
    const working = this.groupWorking(rows, (row) => row.referenceId, query.status);
    const filtered = working.filter((row) =>
      matchesSearch(
        [row.referenceId, row.inputCode, row.label, row.sourceCode, row.displayText],
        query.search,
      ),
    );
    return paginate(filtered, query.page ?? 1, query.limit ?? 20);
  }

  async listTargets(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    inputCode?: string;
  }) {
    const rows = await this.prisma.clinicalTreatmentTarget.findMany({
      where: {
        status: { notIn: ['SUPERSEDED', 'ARCHIVED'] },
        ...(query.inputCode ? { inputCode: query.inputCode } : {}),
      },
      orderBy: [{ inputCode: 'asc' }, { versionNumber: 'desc' }],
    });
    const working = this.groupWorking(rows, (row) => row.targetId, query.status);
    const filtered = working.filter((row) =>
      matchesSearch(
        [row.targetId, row.inputCode, row.label, row.clinicalContext, row.displayText, row.sourceCode],
        query.search,
      ),
    );
    return paginate(filtered, query.page ?? 1, query.limit ?? 20);
  }

  async listPediatric(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    const rows = await this.prisma.clinicalPediatricReferencePolicy.findMany({
      where: { status: { notIn: ['SUPERSEDED', 'ARCHIVED'] } },
      orderBy: [{ inputCode: 'asc' }, { versionNumber: 'desc' }],
    });
    const working = this.groupWorking(rows, (row) => row.inputCode, query.status);
    const filtered = working.filter((row) =>
      matchesSearch([row.inputCode, row.label, row.strategy, row.preferredSource], query.search),
    );
    return paginate(filtered, query.page ?? 1, query.limit ?? 20);
  }

  async listSources(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    const rows = await this.prisma.clinicalReferenceSource.findMany({
      where: { status: { notIn: ['SUPERSEDED', 'ARCHIVED'] } },
      orderBy: [{ sourceName: 'asc' }, { versionNumber: 'desc' }],
    });
    const working = this.groupWorking(rows, (row) => row.sourceCode, query.status);
    const filtered = working.filter((row) =>
      matchesSearch(
        [row.sourceCode, row.sourceName, row.publisher, row.sourceType, row.jurisdiction],
        query.search,
      ),
    );
    return paginate(filtered, query.page ?? 1, query.limit ?? 20);
  }

  async listReleases() {
    const [releases, pointer] = await Promise.all([
      this.prisma.clinicalReferenceRelease.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { values: true, targets: true, pediatric: true, sources: true } },
        },
      }),
      this.prisma.clinicalReferencePointer.findUnique({ where: { id: 'active' } }),
    ]);
    return {
      data: releases.map((release) => ({
        ...release,
        isActive: pointer?.releaseId === release.id,
      })),
    };
  }

  async getValue(id: string) {
    const row = await this.prisma.clinicalReferenceValue.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Reference value not found');
    const history = await this.prisma.clinicalReferenceValue.findMany({
      where: { referenceId: row.referenceId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        releaseId: true,
      },
    });
    const source = row.sourceCode
      ? await this.workingSource(row.sourceCode)
      : null;
    return { ...row, history, source };
  }

  async getTarget(id: string) {
    const row = await this.prisma.clinicalTreatmentTarget.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Treatment target not found');
    const history = await this.prisma.clinicalTreatmentTarget.findMany({
      where: { targetId: row.targetId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        releaseId: true,
      },
    });
    const source = await this.workingSource(row.sourceCode);
    return { ...row, history, source };
  }

  async getPediatric(id: string) {
    const row = await this.prisma.clinicalPediatricReferencePolicy.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pediatric policy not found');
    const history = await this.prisma.clinicalPediatricReferencePolicy.findMany({
      where: { inputCode: row.inputCode },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        releaseId: true,
      },
    });
    return { ...row, history };
  }

  async getSource(id: string) {
    const row = await this.prisma.clinicalReferenceSource.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Source not found');
    const history = await this.prisma.clinicalReferenceSource.findMany({
      where: { sourceCode: row.sourceCode },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        releaseId: true,
      },
    });
    return { ...row, history };
  }

  async createDraft(kind: Kind, id: string, user: RequestUser) {
    if (kind === 'value') {
      const published = await this.prisma.clinicalReferenceValue.findUnique({ where: { id } });
      if (!published) throw new NotFoundException('Reference value not found');
      const existing = await this.openDraft(
        await this.prisma.clinicalReferenceValue.findMany({
          where: { referenceId: published.referenceId, status: { in: ['DRAFT', 'IN_REVIEW'] } },
        }),
      );
      if (existing) return existing;
      const nextVersion = await this.nextVersion('value', published.referenceId);
      const created = await this.prisma.clinicalReferenceValue.create({
        data: {
          ...this.valueCopy(published),
          versionNumber: nextVersion,
          status: 'DRAFT',
          reviewApprovedAt: null,
          releaseId: null,
          supersededById: null,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await this.auditChange(user, 'REFERENCE_VALUE_DRAFT_CREATED', {
        referenceId: created.referenceId,
        fromId: published.id,
        draftId: created.id,
      });
      return created;
    }
    if (kind === 'target') {
      const published = await this.prisma.clinicalTreatmentTarget.findUnique({ where: { id } });
      if (!published) throw new NotFoundException('Treatment target not found');
      const existing = await this.openDraft(
        await this.prisma.clinicalTreatmentTarget.findMany({
          where: { targetId: published.targetId, status: { in: ['DRAFT', 'IN_REVIEW'] } },
        }),
      );
      if (existing) return existing;
      const nextVersion = await this.nextVersion('target', published.targetId);
      const created = await this.prisma.clinicalTreatmentTarget.create({
        data: {
          ...this.targetCopy(published),
          versionNumber: nextVersion,
          status: 'DRAFT',
          reviewApprovedAt: null,
          releaseId: null,
          supersededById: null,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await this.auditChange(user, 'TREATMENT_TARGET_DRAFT_CREATED', {
        targetId: created.targetId,
        fromId: published.id,
        draftId: created.id,
      });
      return created;
    }
    if (kind === 'pediatric') {
      const published = await this.prisma.clinicalPediatricReferencePolicy.findUnique({
        where: { id },
      });
      if (!published) throw new NotFoundException('Pediatric policy not found');
      const existing = await this.openDraft(
        await this.prisma.clinicalPediatricReferencePolicy.findMany({
          where: { inputCode: published.inputCode, status: { in: ['DRAFT', 'IN_REVIEW'] } },
        }),
      );
      if (existing) return existing;
      const nextVersion = await this.nextVersion('pediatric', published.inputCode);
      const created = await this.prisma.clinicalPediatricReferencePolicy.create({
        data: {
          ...this.pediatricCopy(published),
          versionNumber: nextVersion,
          adultFallbackAllowed: false,
          status: 'DRAFT',
          reviewApprovedAt: null,
          releaseId: null,
          supersededById: null,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await this.auditChange(user, 'PEDIATRIC_POLICY_DRAFT_CREATED', {
        inputCode: created.inputCode,
        fromId: published.id,
        draftId: created.id,
      });
      return created;
    }
    const published = await this.prisma.clinicalReferenceSource.findUnique({ where: { id } });
    if (!published) throw new NotFoundException('Source not found');
    const existing = await this.openDraft(
      await this.prisma.clinicalReferenceSource.findMany({
        where: { sourceCode: published.sourceCode, status: { in: ['DRAFT', 'IN_REVIEW'] } },
      }),
    );
    if (existing) return existing;
    const nextVersion = await this.nextVersion('source', published.sourceCode);
    const created = await this.prisma.clinicalReferenceSource.create({
      data: {
        ...this.sourceCopy(published),
        versionNumber: nextVersion,
        status: 'DRAFT',
        reviewApprovedAt: null,
        releaseId: null,
        supersededById: null,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    await this.auditChange(user, 'REFERENCE_SOURCE_DRAFT_CREATED', {
      sourceCode: created.sourceCode,
      fromId: published.id,
      draftId: created.id,
    });
    return created;
  }

  async patchValue(id: string, dto: PatchReferenceValueDto, user: RequestUser) {
    const row = await this.requireDraftValue(id);
    const updated = await this.prisma.clinicalReferenceValue.update({
      where: { id: row.id },
      data: {
        ...dto,
        updatedById: user.id,
        reviewApprovedAt: null,
      },
    });
    await this.auditChange(user, 'REFERENCE_VALUE_DRAFT_UPDATED', {
      referenceId: updated.referenceId,
      id: updated.id,
    });
    return updated;
  }

  async patchTarget(id: string, dto: PatchTreatmentTargetDto, user: RequestUser) {
    const row = await this.requireDraftTarget(id);
    const updated = await this.prisma.clinicalTreatmentTarget.update({
      where: { id: row.id },
      data: { ...dto, updatedById: user.id, reviewApprovedAt: null },
    });
    await this.auditChange(user, 'TREATMENT_TARGET_DRAFT_UPDATED', {
      targetId: updated.targetId,
      id: updated.id,
    });
    return updated;
  }

  async patchPediatric(id: string, dto: PatchPediatricPolicyDto, user: RequestUser) {
    const row = await this.requireDraftPediatric(id);
    if (dto.adultFallbackAllowed) {
      throw new BadRequestException('Pediatric policies cannot allow adult fallback.');
    }
    const updated = await this.prisma.clinicalPediatricReferencePolicy.update({
      where: { id: row.id },
      data: {
        ...dto,
        adultFallbackAllowed: false,
        updatedById: user.id,
        reviewApprovedAt: null,
      },
    });
    await this.auditChange(user, 'PEDIATRIC_POLICY_DRAFT_UPDATED', {
      inputCode: updated.inputCode,
      id: updated.id,
    });
    return updated;
  }

  async patchSource(id: string, dto: PatchReferenceSourceDto, user: RequestUser) {
    const row = await this.requireDraftSource(id);
    const updated = await this.prisma.clinicalReferenceSource.update({
      where: { id: row.id },
      data: {
        sourceName: dto.sourceName,
        sourceType: dto.sourceType,
        publisher: dto.publisher,
        jurisdiction: dto.jurisdiction,
        version: dto.version,
        sourceUrl: dto.sourceUrl,
        useCase: dto.useCase,
        notes: dto.notes,
        lastReviewedAt: dto.lastReviewedAt ? new Date(dto.lastReviewedAt) : dto.lastReviewedAt === null ? null : undefined,
        nextReviewDueAt: dto.nextReviewDueAt ? new Date(dto.nextReviewDueAt) : dto.nextReviewDueAt === null ? null : undefined,
        updatedById: user.id,
        reviewApprovedAt: null,
      },
    });
    await this.auditChange(user, 'REFERENCE_SOURCE_DRAFT_UPDATED', {
      sourceCode: updated.sourceCode,
      id: updated.id,
    });
    return updated;
  }

  async deleteDraft(kind: Kind, id: string, user: RequestUser) {
    if (kind === 'value') {
      const row = await this.requireDraftValue(id);
      await this.prisma.clinicalReferenceValue.delete({ where: { id: row.id } });
      await this.auditChange(user, 'REFERENCE_VALUE_DRAFT_DELETED', { id: row.id, referenceId: row.referenceId });
      return { deleted: true };
    }
    if (kind === 'target') {
      const row = await this.requireDraftTarget(id);
      await this.prisma.clinicalTreatmentTarget.delete({ where: { id: row.id } });
      await this.auditChange(user, 'TREATMENT_TARGET_DRAFT_DELETED', { id: row.id, targetId: row.targetId });
      return { deleted: true };
    }
    if (kind === 'pediatric') {
      const row = await this.requireDraftPediatric(id);
      await this.prisma.clinicalPediatricReferencePolicy.delete({ where: { id: row.id } });
      await this.auditChange(user, 'PEDIATRIC_POLICY_DRAFT_DELETED', { id: row.id, inputCode: row.inputCode });
      return { deleted: true };
    }
    const row = await this.requireDraftSource(id);
    await this.prisma.clinicalReferenceSource.delete({ where: { id: row.id } });
    await this.auditChange(user, 'REFERENCE_SOURCE_DRAFT_DELETED', { id: row.id, sourceCode: row.sourceCode });
    return { deleted: true };
  }

  async submitForReview(kind: Kind, id: string, user: RequestUser) {
    return this.transition(kind, id, 'DRAFT', 'IN_REVIEW', user, 'SUBMITTED_FOR_REVIEW');
  }

  async returnToDraft(kind: Kind, id: string, user: RequestUser) {
    return this.transition(kind, id, 'IN_REVIEW', 'DRAFT', user, 'RETURNED_TO_DRAFT');
  }

  async approve(kind: Kind, id: string, user: RequestUser) {
    const now = new Date();
    if (kind === 'value') {
      const row = await this.prisma.clinicalReferenceValue.findUnique({ where: { id } });
      if (!row || row.status !== 'IN_REVIEW') {
        throw new BadRequestException('Only in-review records can be approved.');
      }
      const updated = await this.prisma.clinicalReferenceValue.update({
        where: { id },
        data: { reviewApprovedAt: now, updatedById: user.id },
      });
      await this.auditChange(user, 'REFERENCE_VALUE_APPROVED', { id, referenceId: row.referenceId });
      return updated;
    }
    if (kind === 'target') {
      const row = await this.prisma.clinicalTreatmentTarget.findUnique({ where: { id } });
      if (!row || row.status !== 'IN_REVIEW') {
        throw new BadRequestException('Only in-review records can be approved.');
      }
      const updated = await this.prisma.clinicalTreatmentTarget.update({
        where: { id },
        data: { reviewApprovedAt: now, updatedById: user.id },
      });
      await this.auditChange(user, 'TREATMENT_TARGET_APPROVED', { id, targetId: row.targetId });
      return updated;
    }
    if (kind === 'pediatric') {
      const row = await this.prisma.clinicalPediatricReferencePolicy.findUnique({ where: { id } });
      if (!row || row.status !== 'IN_REVIEW') {
        throw new BadRequestException('Only in-review records can be approved.');
      }
      const updated = await this.prisma.clinicalPediatricReferencePolicy.update({
        where: { id },
        data: { reviewApprovedAt: now, updatedById: user.id },
      });
      await this.auditChange(user, 'PEDIATRIC_POLICY_APPROVED', { id, inputCode: row.inputCode });
      return updated;
    }
    const row = await this.prisma.clinicalReferenceSource.findUnique({ where: { id } });
    if (!row || row.status !== 'IN_REVIEW') {
      throw new BadRequestException('Only in-review records can be approved.');
    }
    const updated = await this.prisma.clinicalReferenceSource.update({
      where: { id },
      data: { reviewApprovedAt: now, updatedById: user.id },
    });
    await this.auditChange(user, 'REFERENCE_SOURCE_APPROVED', { id, sourceCode: row.sourceCode });
    return updated;
  }

  async publishRelease(user: RequestUser, notes?: string, requestedReleaseId?: string) {
    const [values, targets, pediatric, sources] = await Promise.all([
      this.prisma.clinicalReferenceValue.findMany({
        where: { status: 'IN_REVIEW', reviewApprovedAt: { not: null } },
      }),
      this.prisma.clinicalTreatmentTarget.findMany({
        where: { status: 'IN_REVIEW', reviewApprovedAt: { not: null } },
      }),
      this.prisma.clinicalPediatricReferencePolicy.findMany({
        where: { status: 'IN_REVIEW', reviewApprovedAt: { not: null } },
      }),
      this.prisma.clinicalReferenceSource.findMany({
        where: { status: 'IN_REVIEW', reviewApprovedAt: { not: null } },
      }),
    ]);

    if (!values.length && !targets.length && !pediatric.length && !sources.length) {
      throw new BadRequestException(
        'No approved in-review records are ready to publish. Approve reviewed drafts first.',
      );
    }

    const publishedSources = await this.prisma.clinicalReferenceSource.findMany({
      where: { status: { in: ['ACTIVE', 'IN_REVIEW'] } },
    });
    const sourceSnapshot = this.groupWorking(publishedSources, (row) => row.sourceCode).map((row) => ({
      sourceCode: row.sourceCode,
      status: row.status === 'IN_REVIEW' ? 'ACTIVE' : row.status,
    }));

    const issues = validatePublishSet({
      values: [...values, ...(await this.prisma.clinicalReferenceValue.findMany({ where: { status: 'PUBLISHED' } }))],
      targets: [...targets, ...(await this.prisma.clinicalTreatmentTarget.findMany({ where: { status: 'PUBLISHED' } }))],
      pediatric: [
        ...pediatric,
        ...(await this.prisma.clinicalPediatricReferencePolicy.findMany({ where: { status: 'PUBLISHED' } })),
      ],
      sources: sourceSnapshot,
      knownInputCodes: await this.knownInputCodes(),
    });
    if (issues.length) {
      throw new BadRequestException({
        message: 'Publish validation failed.',
        issues,
      });
    }

    const releaseCode = await this.uniqueReleaseId(requestedReleaseId ?? nextReleaseId());
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.clinicalReferencePointer.findUnique({ where: { id: 'active' } });
      if (previous) {
        await tx.clinicalReferenceRelease.update({
          where: { id: previous.releaseId },
          data: { status: 'SUPERSEDED' },
        });
      }

      const release = await tx.clinicalReferenceRelease.create({
        data: {
          releaseId: releaseCode,
          versionLabel: releaseCode.replace('REFERENCE_RELEASE_', '').replaceAll('_', '-'),
          status: 'PUBLISHED',
          publishedAt: now,
          publishedById: user.id,
          notes: notes ?? null,
        },
      });

      for (const row of values) {
        await this.supersedePrevious(tx, 'value', row.referenceId, row.id);
        await tx.clinicalReferenceValue.update({
          where: { id: row.id },
          data: { status: 'PUBLISHED', releaseId: release.id, updatedById: user.id },
        });
      }
      for (const row of targets) {
        await this.supersedePrevious(tx, 'target', row.targetId, row.id);
        await tx.clinicalTreatmentTarget.update({
          where: { id: row.id },
          data: { status: 'PUBLISHED', releaseId: release.id, updatedById: user.id },
        });
      }
      for (const row of pediatric) {
        await this.supersedePrevious(tx, 'pediatric', row.inputCode, row.id);
        await tx.clinicalPediatricReferencePolicy.update({
          where: { id: row.id },
          data: { status: 'PUBLISHED', releaseId: release.id, updatedById: user.id },
        });
      }
      for (const row of sources) {
        await this.supersedePrevious(tx, 'source', row.sourceCode, row.id);
        await tx.clinicalReferenceSource.update({
          where: { id: row.id },
          data: { status: 'ACTIVE', releaseId: release.id, updatedById: user.id },
        });
      }

      await tx.clinicalReferencePointer.upsert({
        where: { id: 'active' },
        create: { id: 'active', releaseId: release.id },
        update: { releaseId: release.id },
      });

      return release;
    });

    await this.auditChange(user, 'REFERENCE_RELEASE_PUBLISHED', {
      releaseId: result.releaseId,
      values: values.length,
      targets: targets.length,
      pediatric: pediatric.length,
      sources: sources.length,
    });
    return result;
  }

  async importPack(user: RequestUser) {
    const result = await loadClinicalReferencePack(this.prisma, {
      userId: user.id,
      allowDraftReplacements: true,
    });
    await this.auditChange(user, 'REFERENCE_PACK_IMPORTED', {
      bootstrap: result.bootstrap,
      ...result.created,
      skippedImport: result.skipped,
      releaseId: result.releaseId,
    });
    return result;
  }

  async exportPack() {
    const pointer = await this.prisma.clinicalReferencePointer.findUnique({
      where: { id: 'active' },
      include: { release: true },
    });
    const [values, targets, pediatric, sources] = await Promise.all([
      this.prisma.clinicalReferenceValue.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { referenceId: 'asc' },
      }),
      this.prisma.clinicalTreatmentTarget.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { targetId: 'asc' },
      }),
      this.prisma.clinicalPediatricReferencePolicy.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { inputCode: 'asc' },
      }),
      this.prisma.clinicalReferenceSource.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { sourceCode: 'asc' },
      }),
    ]);
    return {
      releaseId: pointer?.release.releaseId ?? null,
      exportedAt: new Date().toISOString(),
      values,
      targets,
      pediatric,
      sources,
    };
  }

  async lookupByInputCode(inputCode: string) {
    const code = inputCode.trim().toUpperCase();
    const [values, targets, pediatric] = await Promise.all([
      this.listValues({ inputCode: code, limit: 50 }),
      this.listTargets({ inputCode: code, limit: 50 }),
      this.prisma.clinicalPediatricReferencePolicy.findMany({
        where: { inputCode: code, status: { notIn: ['SUPERSEDED', 'ARCHIVED'] } },
        orderBy: { versionNumber: 'desc' },
      }),
    ]);
    return {
      inputCode: code,
      values: values.data,
      targets: targets.data,
      pediatric: pickWorkingRecord(pediatric),
    };
  }

  private groupWorking<T extends { status: string; versionNumber: number }>(
    rows: T[],
    keyFn: (row: T) => string,
    status?: string,
  ): T[] {
    const groups = new Map<string, T[]>();
    for (const row of rows) {
      const key = keyFn(row);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    const working = [...groups.values()]
      .map((group) => pickWorkingRecord(group))
      .filter((row): row is T => Boolean(row));
    if (!status) return working;
    if (RECORD_STATUSES.has(status) || SOURCE_STATUSES.has(status)) {
      return working.filter((row) => row.status === status);
    }
    return working;
  }

  private openDraft<T extends { status: string }>(rows: T[]): T | null {
    return rows.find((row) => row.status === 'DRAFT' || row.status === 'IN_REVIEW') ?? null;
  }

  private async nextVersion(kind: Kind, key: string): Promise<number> {
    if (kind === 'value') {
      const last = await this.prisma.clinicalReferenceValue.findFirst({
        where: { referenceId: key },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      return (last?.versionNumber ?? 0) + 1;
    }
    if (kind === 'target') {
      const last = await this.prisma.clinicalTreatmentTarget.findFirst({
        where: { targetId: key },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      return (last?.versionNumber ?? 0) + 1;
    }
    if (kind === 'pediatric') {
      const last = await this.prisma.clinicalPediatricReferencePolicy.findFirst({
        where: { inputCode: key },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      return (last?.versionNumber ?? 0) + 1;
    }
    const last = await this.prisma.clinicalReferenceSource.findFirst({
      where: { sourceCode: key },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return (last?.versionNumber ?? 0) + 1;
  }

  private async uniqueReleaseId(desired: string): Promise<string> {
    const exists = await this.prisma.clinicalReferenceRelease.findUnique({
      where: { releaseId: desired },
    });
    if (!exists) return desired;
    let n = 2;
    while (await this.prisma.clinicalReferenceRelease.findUnique({ where: { releaseId: `${desired}_${n}` } })) {
      n += 1;
    }
    return `${desired}_${n}`;
  }

  private async knownInputCodes(): Promise<Set<string>> {
    const codes = new Set(KNOWN_INPUT_CODES);
    try {
      const rows = await this.prisma.renewMonitoringInput.findMany({
        where: { active: true },
        select: { code: true },
      });
      for (const row of rows) codes.add(row.code);
    } catch {
      /* table may be empty */
    }
    return codes;
  }

  private async workingSource(sourceCode: string) {
    const rows = await this.prisma.clinicalReferenceSource.findMany({
      where: { sourceCode, status: { notIn: ['SUPERSEDED', 'ARCHIVED'] } },
      orderBy: { versionNumber: 'desc' },
    });
    return pickWorkingRecord(rows);
  }

  private async requireDraftValue(id: string) {
    const row = await this.prisma.clinicalReferenceValue.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Reference value not found');
    if (row.status !== 'DRAFT') {
      throw new BadRequestException('Published records cannot be edited in place. Create a draft copy first.');
    }
    return row;
  }

  private async requireDraftTarget(id: string) {
    const row = await this.prisma.clinicalTreatmentTarget.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Treatment target not found');
    if (row.status !== 'DRAFT') {
      throw new BadRequestException('Published records cannot be edited in place. Create a draft copy first.');
    }
    return row;
  }

  private async requireDraftPediatric(id: string) {
    const row = await this.prisma.clinicalPediatricReferencePolicy.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pediatric policy not found');
    if (row.status !== 'DRAFT') {
      throw new BadRequestException('Published records cannot be edited in place. Create a draft copy first.');
    }
    return row;
  }

  private async requireDraftSource(id: string) {
    const row = await this.prisma.clinicalReferenceSource.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Source not found');
    if (row.status !== 'DRAFT') {
      throw new BadRequestException('Published records cannot be edited in place. Create a draft copy first.');
    }
    return row;
  }

  private async transition(
    kind: Kind,
    id: string,
    from: 'DRAFT' | 'IN_REVIEW',
    to: 'DRAFT' | 'IN_REVIEW',
    user: RequestUser,
    action: string,
  ) {
    const fail = () => {
      throw new BadRequestException(`Record must be ${from.replace('_', ' ').toLowerCase()} to ${to === 'DRAFT' ? 'return' : 'submit'}.`);
    };
    if (kind === 'value') {
      const row = await this.prisma.clinicalReferenceValue.findUnique({ where: { id } });
      if (!row || row.status !== from) fail();
      const updated = await this.prisma.clinicalReferenceValue.update({
        where: { id },
        data: { status: to, reviewApprovedAt: null, updatedById: user.id },
      });
      await this.auditChange(user, `REFERENCE_VALUE_${action}`, { id, referenceId: row!.referenceId });
      return updated;
    }
    if (kind === 'target') {
      const row = await this.prisma.clinicalTreatmentTarget.findUnique({ where: { id } });
      if (!row || row.status !== from) fail();
      const updated = await this.prisma.clinicalTreatmentTarget.update({
        where: { id },
        data: { status: to, reviewApprovedAt: null, updatedById: user.id },
      });
      await this.auditChange(user, `TREATMENT_TARGET_${action}`, { id, targetId: row!.targetId });
      return updated;
    }
    if (kind === 'pediatric') {
      const row = await this.prisma.clinicalPediatricReferencePolicy.findUnique({ where: { id } });
      if (!row || row.status !== from) fail();
      const updated = await this.prisma.clinicalPediatricReferencePolicy.update({
        where: { id },
        data: { status: to, reviewApprovedAt: null, updatedById: user.id },
      });
      await this.auditChange(user, `PEDIATRIC_POLICY_${action}`, { id, inputCode: row!.inputCode });
      return updated;
    }
    const row = await this.prisma.clinicalReferenceSource.findUnique({ where: { id } });
    if (!row || row.status !== from) fail();
    const updated = await this.prisma.clinicalReferenceSource.update({
      where: { id },
      data: { status: to, reviewApprovedAt: null, updatedById: user.id },
    });
    await this.auditChange(user, `REFERENCE_SOURCE_${action}`, { id, sourceCode: row!.sourceCode });
    return updated;
  }

  private async supersedePrevious(
    tx: Prisma.TransactionClient,
    kind: Kind,
    key: string,
    keepId: string,
  ) {
    if (kind === 'value') {
      const previous = await tx.clinicalReferenceValue.findMany({
        where: { referenceId: key, status: 'PUBLISHED', id: { not: keepId } },
      });
      for (const row of previous) {
        await tx.clinicalReferenceValue.update({
          where: { id: row.id },
          data: { status: 'SUPERSEDED', supersededById: keepId },
        });
      }
      return;
    }
    if (kind === 'target') {
      const previous = await tx.clinicalTreatmentTarget.findMany({
        where: { targetId: key, status: 'PUBLISHED', id: { not: keepId } },
      });
      for (const row of previous) {
        await tx.clinicalTreatmentTarget.update({
          where: { id: row.id },
          data: { status: 'SUPERSEDED', supersededById: keepId },
        });
      }
      return;
    }
    if (kind === 'pediatric') {
      const previous = await tx.clinicalPediatricReferencePolicy.findMany({
        where: { inputCode: key, status: 'PUBLISHED', id: { not: keepId } },
      });
      for (const row of previous) {
        await tx.clinicalPediatricReferencePolicy.update({
          where: { id: row.id },
          data: { status: 'SUPERSEDED', supersededById: keepId },
        });
      }
      return;
    }
    const previous = await tx.clinicalReferenceSource.findMany({
      where: { sourceCode: key, status: 'ACTIVE', id: { not: keepId } },
    });
    for (const row of previous) {
      await tx.clinicalReferenceSource.update({
        where: { id: row.id },
        data: { status: 'SUPERSEDED', supersededById: keepId },
      });
    }
  }

  private valueCopy(row: Prisma.ClinicalReferenceValueGetPayload<object>) {
    return {
      referenceId: row.referenceId,
      inputCode: row.inputCode,
      label: row.label,
      category: row.category,
      population: row.population,
      sex: row.sex,
      context: row.context,
      referenceStrategy: row.referenceStrategy,
      referenceKind: row.referenceKind,
      uiUse: row.uiUse,
      lowerNumeric: row.lowerNumeric,
      upperNumeric: row.upperNumeric,
      operator: row.operator,
      targetValue: row.targetValue,
      unit: row.unit,
      displayText: row.displayText,
      sourceCode: row.sourceCode,
      sourcePriority: row.sourcePriority,
      notes: row.notes,
      effectiveDate: row.effectiveDate,
    };
  }

  private targetCopy(row: Prisma.ClinicalTreatmentTargetGetPayload<object>) {
    return {
      targetId: row.targetId,
      inputCode: row.inputCode,
      label: row.label,
      population: row.population,
      clinicalContext: row.clinicalContext,
      parameter: row.parameter,
      operator: row.operator,
      targetValue: row.targetValue,
      unit: row.unit,
      displayText: row.displayText,
      sourceCode: row.sourceCode,
      targetType: row.targetType,
      notes: row.notes,
      effectiveDate: row.effectiveDate,
    };
  }

  private pediatricCopy(row: Prisma.ClinicalPediatricReferencePolicyGetPayload<object>) {
    return {
      inputCode: row.inputCode,
      label: row.label,
      category: row.category,
      strategy: row.strategy,
      preferredSource: row.preferredSource,
      fallbackAllowed: false,
      adultFallbackAllowed: false,
      implementationNote: row.implementationNote,
      sourceUrl: row.sourceUrl,
    };
  }

  private sourceCopy(row: Prisma.ClinicalReferenceSourceGetPayload<object>) {
    return {
      sourceCode: row.sourceCode,
      sourceName: row.sourceName,
      sourceType: row.sourceType,
      publisher: row.publisher,
      jurisdiction: row.jurisdiction,
      version: row.version,
      publicationDate: row.publicationDate,
      effectiveDate: row.effectiveDate,
      sourceUrl: row.sourceUrl,
      lastReviewedAt: row.lastReviewedAt,
      nextReviewDueAt: row.nextReviewDueAt,
      useCase: row.useCase,
      notes: row.notes,
    };
  }

  private async auditChange(user: RequestUser, action: string, metadata: Record<string, unknown>) {
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action,
      module: REFERENCE_AUDIT_MODULE,
      metadata,
    });
  }
}
